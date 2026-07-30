import { api, Query } from "encore.dev/api";
import type { Primitive } from "encore.dev/storage/sqldb";
import { db } from "./db";
import { ensureSeeded } from "./seed";
import { ensureMarketingSpendSeeded } from "./marketingSpendSeed";
import { computeMrrTrend } from "./metrics/mrrTrend";
import { computeMrrWaterfall, type MrrWaterfall } from "./metrics/mrrWaterfall";
import { computeCustomerGrowth } from "./metrics/customerGrowth";
import { computeSubscriptionBreakdown } from "./metrics/subscriptionBreakdown";
import { computeChurnRate } from "./metrics/churnRate";
import { computeNrr } from "./metrics/nrr";
import { computeCac } from "./metrics/cac";
import { computeClv } from "./metrics/clv";
import { computeStickiness } from "./metrics/stickiness";
import { computeEngagementTrend } from "./metrics/engagementTrend";
import { computeActivationFunnel } from "./metrics/activationFunnel";
import { computeFeatureAdoptionRate } from "./metrics/featureAdoptionRate";
import { computeFeatureUsageRanking } from "./metrics/featureUsageRanking";
import { computeCohortRetention } from "./metrics/cohortRetention";
import type {
  CompanyRow as MetricsCompanyRow,
  MarketingSpendRow,
  SubscriptionEventRow,
  SubscriptionRow as MetricsSubscriptionRow,
  UserRow as MetricsUserRow,
  ProductEventRow as MetricsProductEventRow,
} from "./metrics/types";

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

interface ExecutiveOverviewResponse {
  kpis: {
    mrr: number;
    arr: number;
    revenue_growth_pct: number;
    customer_count: number;
    cac: number;
    clv: number;
    churn_rate_pct: number;
    nrr_pct: number;
  };
  charts: {
    revenue_trend: { month: string; mrr: number }[];
    mrr_waterfall: MrrWaterfall;
    customer_growth: { month: string; active_customers: number }[];
    subscription_breakdown: { plan_tier: string; count: number; mrr: number }[];
  };
}

export const executiveOverview = api(
  { method: "GET", path: "/metrics/executive-overview", expose: true },
  async (): Promise<ExecutiveOverviewResponse> => {
    await ensureSeeded();
    await ensureMarketingSpendSeeded();
    const now = new Date();

    const companies: MetricsCompanyRow[] = [];
    for await (const r of db.query<MetricsCompanyRow>`
      SELECT id, signup_date::text AS signup_date FROM companies
    `) {
      companies.push(r);
    }

    const subscriptions: MetricsSubscriptionRow[] = [];
    for await (const r of db.query<MetricsSubscriptionRow>`
      SELECT company_id, plan_name, mrr_amount::float AS mrr_amount, status,
             start_date::text AS start_date, end_date::text AS end_date
      FROM subscriptions
    `) {
      subscriptions.push(r);
    }

    const events: SubscriptionEventRow[] = [];
    for await (const r of db.query<SubscriptionEventRow>`
      SELECT company_id, event_date::text AS event_date, event_type, mrr_change::float AS mrr_change
      FROM subscription_events
    `) {
      events.push(r);
    }

    const spend: MarketingSpendRow[] = [];
    for await (const r of db.query<MarketingSpendRow>`
      SELECT month::text AS month, amount::float AS amount FROM marketing_spend
    `) {
      spend.push(r);
    }

    const revenueTrend = computeMrrTrend(events, now, 12);
    const mrrWaterfall = computeMrrWaterfall(events, now);
    const customerGrowth = computeCustomerGrowth(companies, subscriptions, now, 12);
    const subscriptionBreakdown = computeSubscriptionBreakdown(subscriptions);
    const churnRate = computeChurnRate(companies, subscriptions, now);
    const nrr = computeNrr(companies, events, now);
    const cac = computeCac(spend, events, now);
    const clv = computeClv(subscriptions, churnRate);

    const currentMrr = revenueTrend[revenueTrend.length - 1]?.mrr ?? 0;
    const previousMrr = revenueTrend[revenueTrend.length - 2]?.mrr ?? 0;
    const revenueGrowthPct = previousMrr === 0 ? 0 : ((currentMrr - previousMrr) / previousMrr) * 100;

    return {
      kpis: {
        mrr: currentMrr,
        arr: currentMrr * 12,
        revenue_growth_pct: revenueGrowthPct,
        customer_count: customerGrowth[customerGrowth.length - 1]?.active_customers ?? 0,
        cac,
        clv,
        churn_rate_pct: churnRate * 100,
        nrr_pct: nrr * 100,
      },
      charts: {
        revenue_trend: revenueTrend,
        mrr_waterfall: mrrWaterfall,
        customer_growth: customerGrowth,
        subscription_breakdown: subscriptionBreakdown,
      },
    };
  },
);

interface ProductOverviewResponse {
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    stickiness_pct: number;
    feature_adoption_pct: number;
  };
  funnel: { stage: string; count: number }[];
  charts: {
    feature_usage_ranking: { feature_name: string; event_count: number }[];
    engagement_trend: { date: string; dau: number; wau: number; mau: number }[];
    cohort_retention: { cohort_month: string; months_since_signup: number; retention_pct: number }[];
  };
}

export const productOverview = api(
  { method: "GET", path: "/metrics/product-overview", expose: true },
  async (): Promise<ProductOverviewResponse> => {
    await ensureSeeded();
    const now = new Date();

    const users: MetricsUserRow[] = [];
    for await (const r of db.query<MetricsUserRow>`
      SELECT id, company_id, first_login_at, created_at FROM users
    `) {
      users.push(r);
    }

    const events: MetricsProductEventRow[] = [];
    for await (const r of db.query<MetricsProductEventRow>`
      SELECT user_id, feature_name, "timestamp" FROM product_events
    `) {
      events.push(r);
    }

    const paidCompanyIds = new Set<string>();
    for await (const r of db.query<{ company_id: string }>`
      SELECT company_id FROM subscriptions WHERE plan_name != 'free'
    `) {
      paidCompanyIds.add(r.company_id);
    }

    const engagementTrend = computeEngagementTrend(events, now, 30);
    const lastPoint = engagementTrend[engagementTrend.length - 1];
    const dau = lastPoint?.dau ?? 0;
    const wau = lastPoint?.wau ?? 0;
    const mau = lastPoint?.mau ?? 0;

    return {
      kpis: {
        dau,
        wau,
        mau,
        stickiness_pct: computeStickiness(dau, mau),
        feature_adoption_pct: computeFeatureAdoptionRate(events, now),
      },
      funnel: computeActivationFunnel(users, events, paidCompanyIds),
      charts: {
        feature_usage_ranking: computeFeatureUsageRanking(events),
        engagement_trend: engagementTrend,
        cohort_retention: computeCohortRetention(users, events, now, 12),
      },
    };
  },
);
