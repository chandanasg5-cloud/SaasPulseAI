import { db } from "./db";
import { ensureSeeded } from "./seed";
import { ensureSegmented } from "./segmentation";
import { ensureChurnPredicted } from "./churnPrediction";
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeHealthScore } from "./metrics/healthScore";
import { computeRecommendedAction } from "./metrics/recommendedAction";
import type { CompanyEventRow, SupportTicketRow, UserRow, ProductEventRow } from "./metrics/types";

interface CompanyMatchRow {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  plan_name: string;
  status: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  health: {
    usage_score: number;
    adoption_score: number;
    support_score: number;
    revenue_score: number;
    overall_score: number;
    risk_level: string;
    recommended_action: string;
  };
  segment_label: string | null;
  churn: {
    probability: number;
    risk_level: string;
    primary_risk_driver: string;
    secondary_risk_driver: string;
    recommendation: string;
  } | null;
}

export type CompanyProfileResult = { found: true; company: CompanyProfile } | { found: false };

export async function getCompanyProfile(companyName: string): Promise<CompanyProfileResult> {
  await ensureSeeded();

  let match = await db.queryRow<CompanyMatchRow>`
    SELECT c.id, c.name, c.industry, c.plan_tier,
      COALESCE(s.plan_name, 'none') AS plan_name,
      COALESCE(s.status, 'none') AS status
    FROM companies c
    LEFT JOIN subscriptions s ON s.company_id = c.id
    WHERE LOWER(c.name) = LOWER(${companyName})
    ORDER BY c.id
    LIMIT 1
  `;

  if (!match) {
    match = await db.queryRow<CompanyMatchRow>`
      SELECT c.id, c.name, c.industry, c.plan_tier,
        COALESCE(s.plan_name, 'none') AS plan_name,
        COALESCE(s.status, 'none') AS status
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE c.name ILIKE ${"%" + companyName + "%"}
      ORDER BY c.id
      LIMIT 1
    `;
  }

  if (!match) return { found: false };

  const now = new Date();

  const users: UserRow[] = [];
  for await (const r of db.query<UserRow>`
    SELECT id, company_id, first_login_at, created_at FROM users WHERE company_id = ${match.id}
  `) {
    users.push(r);
  }

  const events: CompanyEventRow[] = [];
  for await (const r of db.query<CompanyEventRow>`
    SELECT company_id, user_id, feature_name, "timestamp" FROM product_events WHERE company_id = ${match.id}
  `) {
    events.push(r);
  }
  const productEventRows: ProductEventRow[] = events.map((e) => ({
    user_id: e.user_id,
    feature_name: e.feature_name,
    timestamp: e.timestamp,
  }));

  const tickets: SupportTicketRow[] = [];
  for await (const r of db.query<SupportTicketRow>`
    SELECT company_id, priority, created_at FROM support_tickets WHERE company_id = ${match.id}
  `) {
    tickets.push(r);
  }

  const usageScore = computeUsageScore(users, productEventRows, now);
  const adoptionScore = computeFeatureAdoptionScore(productEventRows, now);
  const supportScore = computeSupportScore(tickets, now);
  const revenueScore = computeRevenueScore({ plan_name: match.plan_name, status: match.status });
  const health = computeHealthScore(usageScore, adoptionScore, supportScore, revenueScore);
  const recommendedAction = computeRecommendedAction(health);

  await ensureSegmented();
  await ensureChurnPredicted();

  const segmentRow = await db.queryRow<{ segment_label: string }>`
    SELECT segment_label FROM ml_predictions
    WHERE company_id = ${match.id} AND prediction_type = 'segment'
  `;

  const churnRow = await db.queryRow<{ churn_probability: number; recommendation: string; main_drivers: string }>`
    SELECT churn_probability::float AS churn_probability, recommendation, main_drivers::text AS main_drivers
    FROM ml_predictions
    WHERE company_id = ${match.id} AND prediction_type = 'churn_probability'
  `;

  let churn: CompanyProfile["churn"] = null;
  if (churnRow) {
    const drivers = JSON.parse(churnRow.main_drivers);
    churn = {
      probability: churnRow.churn_probability,
      risk_level: drivers.risk_level,
      primary_risk_driver: drivers.primary_risk_driver,
      secondary_risk_driver: drivers.secondary_risk_driver,
      recommendation: churnRow.recommendation,
    };
  }

  return {
    found: true,
    company: {
      id: match.id,
      name: match.name,
      industry: match.industry,
      plan_tier: match.plan_tier,
      health: {
        usage_score: health.usage_score,
        adoption_score: health.adoption_score,
        support_score: health.support_score,
        revenue_score: health.revenue_score,
        overall_score: health.overall_score,
        risk_level: health.risk_level,
        recommended_action: recommendedAction,
      },
      segment_label: segmentRow?.segment_label ?? null,
      churn,
    },
  };
}
