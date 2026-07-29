import { api, Query } from "encore.dev/api";
import type { Primitive } from "encore.dev/storage/sqldb";
import { db } from "./db";
import { ensureSeeded } from "./seed";

export const health = api(
  { method: "GET", path: "/health", expose: true },
  async (): Promise<{ status: string }> => {
    return { status: "ok" };
  },
);

interface CompanyCountResponse {
  total_companies: number;
  active_companies: number;
  churned_companies: number;
}

export const companiesCount = api(
  { method: "GET", path: "/companies/count", expose: true },
  async (): Promise<CompanyCountResponse> => {
    await ensureSeeded();
    const row = await db.queryRow<{ total: number; active: number; churned: number }>`
      WITH churn_status AS (
        SELECT c.id,
          EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.company_id = c.id AND s.status = 'canceled' AND s.end_date <= CURRENT_DATE
          ) AS is_churned
        FROM companies c
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE NOT is_churned)::int AS active,
        COUNT(*) FILTER (WHERE is_churned)::int AS churned
      FROM churn_status
    `;
    return {
      total_companies: row?.total ?? 0,
      active_companies: row?.active ?? 0,
      churned_companies: row?.churned ?? 0,
    };
  },
);

interface ListCompaniesParams {
  page?: Query<number>;
  pageSize?: Query<number>;
  planTier?: Query<string>;
  industry?: Query<string>;
}

interface CompanySummary {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  customer_stage: string;
  mrr: number;
}

export const listCompanies = api(
  { method: "GET", path: "/companies", expose: true },
  async (params: ListCompaniesParams): Promise<{ companies: CompanySummary[]; total: number }> => {
    await ensureSeeded();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: Primitive[] = [];
    if (params.planTier) {
      conditions.push(`c.plan_tier = $${values.length + 1}`);
      values.push(params.planTier);
    }
    if (params.industry) {
      conditions.push(`c.industry = $${values.length + 1}`);
      values.push(params.industry);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await db.rawQueryRow<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM companies c ${whereClause}`,
      ...values,
    );

    const listSql = `
      SELECT c.id, c.name, c.industry, c.plan_tier, c.customer_stage,
        COALESCE(s.mrr_amount, 0)::float AS mrr
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      ${whereClause}
      ORDER BY c.id
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const rows = db.rawQuery<CompanySummary>(listSql, ...values, pageSize, offset);
    const companies: CompanySummary[] = [];
    for await (const row of rows) companies.push(row);

    return { companies, total: countRow?.n ?? 0 };
  },
);

interface MetricsOverviewResponse {
  total_companies: number;
  total_users: number;
  total_events: number;
  current_mrr: number;
}

export const metricsOverview = api(
  { method: "GET", path: "/metrics/overview", expose: true },
  async (): Promise<MetricsOverviewResponse> => {
    await ensureSeeded();
    const row = await db.queryRow<{
      total_companies: number; total_users: number; total_events: number; current_mrr: number;
    }>`
      SELECT
        (SELECT COUNT(*)::int FROM companies) AS total_companies,
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM product_events) AS total_events,
        (SELECT COALESCE(SUM(mrr_amount), 0)::float FROM subscriptions WHERE status = 'active') AS current_mrr
    `;
    return {
      total_companies: row?.total_companies ?? 0,
      total_users: row?.total_users ?? 0,
      total_events: row?.total_events ?? 0,
      current_mrr: row?.current_mrr ?? 0,
    };
  },
);
