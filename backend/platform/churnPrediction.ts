import { db } from "./db";
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeSeatPenetrationScore } from "./metrics/seatPenetrationScore";
import { computeTenureDays, computeRecencyDays } from "./metrics/churnFeatures";
import { computeChurnRiskLevel } from "./metrics/churnRiskLevel";
import { computeChurnRecommendedAction } from "./metrics/churnRecommendedAction";
import { computeChurnDrivers, type ChurnFeatureVector, type FeatureImportances } from "./metrics/churnDrivers";
import { callChurnPredictionService, type ChurnRequestCompany } from "./mlClient";
import { parseLocalDate } from "./metrics/months";
import type { CompanyEventRow, SupportTicketRow, UserRow, ProductEventRow } from "./metrics/types";
import type { Primitive, SQLDatabase, Transaction } from "encore.dev/storage/sqldb";

type Executor = SQLDatabase | Transaction;

interface ChurnCompanyRow {
  id: string;
  company_size: number;
  signup_date: string;
  plan_name: string;
  status: string;
  is_active: boolean;
}

interface CompanyFeatures extends ChurnFeatureVector {
  id: string;
  churned: boolean;
}

let churnPredicted: Promise<void> | null = null;

export function ensureChurnPredicted(): Promise<void> {
  if (!churnPredicted) churnPredicted = doPredict();
  return churnPredicted;
}

export async function doPredict(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'`;
  if (existing && existing.n > 0) return;

  const now = new Date();

  const companies: ChurnCompanyRow[] = [];
  for await (const r of db.query<ChurnCompanyRow>`
    SELECT c.id, c.company_size, c.signup_date::text AS signup_date,
      COALESCE(s.plan_name, 'none') AS plan_name,
      COALESCE(s.status, 'none') AS status,
      (s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)) AS is_active
    FROM companies c
    LEFT JOIN subscriptions s ON s.company_id = c.id
    ORDER BY c.id
  `) {
    companies.push(r);
  }
  if (companies.length === 0) return;

  const users: UserRow[] = [];
  for await (const r of db.query<UserRow>`SELECT id, company_id, first_login_at, created_at FROM users`) {
    users.push(r);
  }

  const events: CompanyEventRow[] = [];
  for await (const r of db.query<CompanyEventRow>`
    SELECT company_id, user_id, feature_name, "timestamp" FROM product_events
  `) {
    events.push(r);
  }

  const tickets: SupportTicketRow[] = [];
  for await (const r of db.query<SupportTicketRow>`SELECT company_id, priority, created_at FROM support_tickets`) {
    tickets.push(r);
  }

  const usersByCompany = new Map<string, UserRow[]>();
  for (const u of users) {
    const arr = usersByCompany.get(u.company_id) ?? [];
    arr.push(u);
    usersByCompany.set(u.company_id, arr);
  }

  const eventsByCompany = new Map<string, CompanyEventRow[]>();
  for (const e of events) {
    const arr = eventsByCompany.get(e.company_id) ?? [];
    arr.push(e);
    eventsByCompany.set(e.company_id, arr);
  }

  const ticketsByCompany = new Map<string, SupportTicketRow[]>();
  for (const t of tickets) {
    const arr = ticketsByCompany.get(t.company_id) ?? [];
    arr.push(t);
    ticketsByCompany.set(t.company_id, arr);
  }

  const features: CompanyFeatures[] = companies.map((c) => {
    const companyUsers = usersByCompany.get(c.id) ?? [];
    const companyEvents = eventsByCompany.get(c.id) ?? [];
    const companyTickets = ticketsByCompany.get(c.id) ?? [];
    const productEventRows: ProductEventRow[] = companyEvents.map((e) => ({
      user_id: e.user_id,
      feature_name: e.feature_name,
      timestamp: e.timestamp,
    }));

    const tenureDays = computeTenureDays(parseLocalDate(c.signup_date), now);

    return {
      id: c.id,
      usage_score: computeUsageScore(companyUsers, productEventRows, now),
      adoption_score: computeFeatureAdoptionScore(productEventRows, now),
      support_score: computeSupportScore(companyTickets, now),
      revenue_score: computeRevenueScore({ plan_name: c.plan_name, status: c.status }),
      seat_penetration_score: computeSeatPenetrationScore(companyUsers, productEventRows, c.company_size, now),
      tenure_days: tenureDays,
      recency_days: computeRecencyDays(productEventRows, tenureDays, now),
      churned: !c.is_active,
    };
  });

  const churnRequest: ChurnRequestCompany[] = features.map((f) => ({
    company_id: f.id,
    usage_score: f.usage_score,
    adoption_score: f.adoption_score,
    support_score: f.support_score,
    revenue_score: f.revenue_score,
    seat_penetration_score: f.seat_penetration_score,
    tenure_days: f.tenure_days,
    recency_days: f.recency_days,
    churned: f.churned,
  }));

  const result = await callChurnPredictionService(churnRequest);
  if (result.predictions.length !== features.length) {
    throw new Error(
      `ml-service returned ${result.predictions.length} predictions for ${features.length} companies`,
    );
  }

  const populationAverages: ChurnFeatureVector = {
    usage_score: average(features.map((f) => f.usage_score)),
    adoption_score: average(features.map((f) => f.adoption_score)),
    support_score: average(features.map((f) => f.support_score)),
    revenue_score: average(features.map((f) => f.revenue_score)),
    seat_penetration_score: average(features.map((f) => f.seat_penetration_score)),
    tenure_days: average(features.map((f) => f.tenure_days)),
    recency_days: average(features.map((f) => f.recency_days)),
  };

  const importances: FeatureImportances = result.feature_importances;
  const featuresById = new Map(features.map((f) => [f.id, f]));
  const activeCompanyIds = new Set(companies.filter((c) => c.is_active).map((c) => c.id));

  const today = now.toISOString().slice(0, 10);
  const columns = [
    "id", "company_id", "prediction_type", "prediction_date",
    "churn_probability", "segment_label", "main_drivers", "recommendation", "model_version",
  ];
  const rows: Primitive[][] = [];
  let idx = 0;

  for (const prediction of result.predictions) {
    if (!activeCompanyIds.has(prediction.company_id)) continue;
    const f = featuresById.get(prediction.company_id);
    if (!f) continue;

    const featureVector: ChurnFeatureVector = {
      usage_score: f.usage_score,
      adoption_score: f.adoption_score,
      support_score: f.support_score,
      revenue_score: f.revenue_score,
      seat_penetration_score: f.seat_penetration_score,
      tenure_days: f.tenure_days,
      recency_days: f.recency_days,
    };
    const riskLevel = computeChurnRiskLevel(prediction.churn_probability);
    const drivers = computeChurnDrivers(featureVector, populationAverages, importances);
    const recommendation = computeChurnRecommendedAction(riskLevel, drivers.primary_risk_driver);

    const mainDrivers = {
      ...featureVector,
      risk_level: riskLevel,
      primary_risk_driver: drivers.primary_risk_driver,
      secondary_risk_driver: drivers.secondary_risk_driver,
      algorithm: result.metadata.algorithm,
      algorithm_version: result.metadata.algorithm_version,
      random_seed: result.metadata.random_seed,
      generated_at: result.metadata.generated_at,
      held_out_metrics: result.metadata.held_out_metrics,
    };

    rows.push([
      `CHURN-${String(idx + 1).padStart(5, "0")}`,
      prediction.company_id,
      "churn_probability",
      today,
      prediction.churn_probability,
      null,
      mainDrivers,
      recommendation,
      "xgboost-v1",
    ]);
    idx++;
  }

  const tx = await db.begin();
  try {
    await batchInsert(tx, columns, rows);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function batchInsert(
  executor: Executor,
  columns: string[],
  rows: Primitive[][],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueClauses: string[] = [];
    const params: Primitive[] = [];
    batch.forEach((row, rowIdx) => {
      const placeholders = row.map((_, colIdx) => `$${rowIdx * row.length + colIdx + 1}`);
      valueClauses.push(`(${placeholders.join(", ")})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ml_predictions (${columns.join(", ")}) VALUES ${valueClauses.join(", ")}`;
    await executor.rawExec(sql, ...params);
  }
}
