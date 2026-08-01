import { db } from "./db";
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeSeatPenetrationScore } from "./metrics/seatPenetrationScore";
import { computeSegmentLabels, type SegmentCentroid } from "./metrics/segmentLabel";
import { computeDistanceAndConfidence, type CentroidWithId } from "./metrics/clusterConfidence";
import { computeSegmentDrivers, type ScoreVector } from "./metrics/segmentDrivers";
import { callClusterService, type ClusterRequestCompany } from "./mlClient";
import type { CompanyEventRow, SupportTicketRow, UserRow, ProductEventRow } from "./metrics/types";
import type { Primitive, SQLDatabase, Transaction } from "encore.dev/storage/sqldb";

type Executor = SQLDatabase | Transaction;

interface SegmentActiveCompanyRow {
  id: string;
  company_size: number;
  plan_name: string;
  status: string;
}

interface CompanyFeatures {
  id: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

let segmented: Promise<void> | null = null;

export function ensureSegmented(): Promise<void> {
  if (!segmented) segmented = doSegment();
  return segmented;
}

export async function doSegment(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
  if (existing && existing.n > 0) return;

  const now = new Date();

  const companies: SegmentActiveCompanyRow[] = [];
  for await (const r of db.query<SegmentActiveCompanyRow>`
    SELECT c.id, c.company_size,
      COALESCE(s.plan_name, 'none') AS plan_name,
      COALESCE(s.status, 'none') AS status
    FROM companies c
    LEFT JOIN subscriptions s ON s.company_id = c.id
    WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
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

    return {
      id: c.id,
      usage_score: computeUsageScore(companyUsers, productEventRows, now),
      adoption_score: computeFeatureAdoptionScore(productEventRows, now),
      support_score: computeSupportScore(companyTickets, now),
      revenue_score: computeRevenueScore({ plan_name: c.plan_name, status: c.status }),
      seat_penetration_score: computeSeatPenetrationScore(companyUsers, productEventRows, c.company_size, now),
    };
  });

  const clusterRequest: ClusterRequestCompany[] = features.map((f) => ({
    company_id: f.id,
    usage_score: f.usage_score,
    adoption_score: f.adoption_score,
    support_score: f.support_score,
    revenue_score: f.revenue_score,
    seat_penetration_score: f.seat_penetration_score,
  }));

  const clusterResult = await callClusterService(clusterRequest);
  if (clusterResult.assignments.length !== features.length) {
    throw new Error(
      `ml-service returned ${clusterResult.assignments.length} assignments for ${features.length} companies`,
    );
  }

  const segmentCentroids: SegmentCentroid[] = clusterResult.centroids.map((c) => ({
    cluster_id: c.cluster_id,
    usage_score: c.usage_score,
    adoption_score: c.adoption_score,
    support_score: c.support_score,
    revenue_score: c.revenue_score,
    seat_penetration_score: c.seat_penetration_score,
  }));
  const labels = computeSegmentLabels(segmentCentroids);

  const centroidsWithId: CentroidWithId[] = clusterResult.centroids.map((c) => ({
    cluster_id: c.cluster_id,
    vector: [c.usage_score, c.adoption_score, c.support_score, c.revenue_score, c.seat_penetration_score],
  }));

  const populationAverages: ScoreVector = {
    usage_score: average(features.map((f) => f.usage_score)),
    adoption_score: average(features.map((f) => f.adoption_score)),
    support_score: average(features.map((f) => f.support_score)),
    revenue_score: average(features.map((f) => f.revenue_score)),
    seat_penetration_score: average(features.map((f) => f.seat_penetration_score)),
  };

  const featuresById = new Map(features.map((f) => [f.id, f]));
  const today = now.toISOString().slice(0, 10);
  const columns = [
    "id", "company_id", "prediction_type", "prediction_date",
    "churn_probability", "segment_label", "main_drivers", "recommendation", "model_version",
  ];
  const rows: Primitive[][] = [];

  clusterResult.assignments.forEach((assignment, idx) => {
    const f = featuresById.get(assignment.company_id);
    if (!f) return;
    const companyVector = [f.usage_score, f.adoption_score, f.support_score, f.revenue_score, f.seat_penetration_score];
    const { distance_to_centroid, cluster_confidence } = computeDistanceAndConfidence(
      companyVector,
      assignment.cluster_id,
      centroidsWithId,
    );
    const scoreVector: ScoreVector = {
      usage_score: f.usage_score,
      adoption_score: f.adoption_score,
      support_score: f.support_score,
      revenue_score: f.revenue_score,
      seat_penetration_score: f.seat_penetration_score,
    };
    const drivers = computeSegmentDrivers(scoreVector, populationAverages);
    const segmentLabel = labels.get(assignment.cluster_id) ?? "Unknown";

    const mainDrivers = {
      cluster_id: assignment.cluster_id,
      ...scoreVector,
      distance_to_centroid,
      cluster_confidence,
      primary_driver: drivers.primary_driver,
      secondary_driver: drivers.secondary_driver,
      algorithm: clusterResult.metadata.algorithm,
      algorithm_version: clusterResult.metadata.algorithm_version,
      random_seed: clusterResult.metadata.random_seed,
      generated_at: clusterResult.metadata.generated_at,
    };

    rows.push([
      `SEG-${String(idx + 1).padStart(5, "0")}`,
      assignment.company_id,
      "segment",
      today,
      null,
      segmentLabel,
      mainDrivers,
      null,
      "kmeans-v1",
    ]);
  });

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
