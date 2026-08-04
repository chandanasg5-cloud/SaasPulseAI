import { api, Query } from "encore.dev/api";
import type { Primitive } from "encore.dev/storage/sqldb";
import { db } from "./db";
import { ensureSeeded } from "./seed";
import { ensureSegmented } from "./segmentation";
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
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeHealthScore } from "./metrics/healthScore";
import { computeRecommendedAction } from "./metrics/recommendedAction";
import { filterCardsByCompanyName } from "./metrics/filterCardsByCompanyName";
import { ensureChurnPredicted } from "./churnPrediction";
import { getCompanyProfile, type CompanyProfile, type CompanyProfileResult } from "./companyProfile";
import type {
  CompanyRow as MetricsCompanyRow,
  MarketingSpendRow,
  SubscriptionEventRow,
  SubscriptionRow as MetricsSubscriptionRow,
  UserRow as MetricsUserRow,
  ProductEventRow as MetricsProductEventRow,
  CompanyEventRow,
  SupportTicketRow as MetricsSupportTicketRow,
  UserRow as HealthUserRow,
  ProductEventRow as HealthProductEventRow,
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

interface ActiveCompanyRow {
  id: string;
  name: string;
  plan_tier: string;
  plan_name: string;
  status: string;
}

interface CustomerHealthCard {
  company_id: string;
  company_name: string;
  plan_tier: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  overall_score: number;
  risk_level: string;
  recommended_action: string;
}

interface CustomerHealthScoresParams {
  page?: Query<number>;
  pageSize?: Query<number>;
  q?: Query<string>;
}

export const customerHealthScores = api(
  { method: "GET", path: "/customers/health-scores", expose: true },
  async (params: CustomerHealthScoresParams): Promise<{ customers: CustomerHealthCard[]; total: number }> => {
    await ensureSeeded();
    const now = new Date();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));

    const companies: ActiveCompanyRow[] = [];
    for await (const r of db.query<ActiveCompanyRow>`
      SELECT c.id, c.name, c.plan_tier,
        COALESCE(s.plan_name, 'none') AS plan_name,
        COALESCE(s.status, 'none') AS status
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
      ORDER BY c.id
    `) {
      companies.push(r);
    }

    const users: HealthUserRow[] = [];
    for await (const r of db.query<HealthUserRow>`
      SELECT id, company_id, first_login_at, created_at FROM users
    `) {
      users.push(r);
    }

    const events: CompanyEventRow[] = [];
    for await (const r of db.query<CompanyEventRow>`
      SELECT company_id, user_id, feature_name, "timestamp" FROM product_events
    `) {
      events.push(r);
    }

    const tickets: MetricsSupportTicketRow[] = [];
    for await (const r of db.query<MetricsSupportTicketRow>`
      SELECT company_id, priority, created_at FROM support_tickets
    `) {
      tickets.push(r);
    }

    const usersByCompany = new Map<string, HealthUserRow[]>();
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

    const ticketsByCompany = new Map<string, MetricsSupportTicketRow[]>();
    for (const t of tickets) {
      const arr = ticketsByCompany.get(t.company_id) ?? [];
      arr.push(t);
      ticketsByCompany.set(t.company_id, arr);
    }

    const allCards: CustomerHealthCard[] = companies.map((c) => {
      const companyUsers = usersByCompany.get(c.id) ?? [];
      const companyEvents = eventsByCompany.get(c.id) ?? [];
      const companyTickets = ticketsByCompany.get(c.id) ?? [];
      const productEventRows: HealthProductEventRow[] = companyEvents.map((e) => ({
        user_id: e.user_id,
        feature_name: e.feature_name,
        timestamp: e.timestamp,
      }));

      const usageScore = computeUsageScore(companyUsers, productEventRows, now);
      const adoptionScore = computeFeatureAdoptionScore(productEventRows, now);
      const supportScore = computeSupportScore(companyTickets, now);
      const revenueScore = computeRevenueScore({ plan_name: c.plan_name, status: c.status });
      const health = computeHealthScore(usageScore, adoptionScore, supportScore, revenueScore);
      const recommendedAction = computeRecommendedAction(health);

      return {
        company_id: c.id,
        company_name: c.name,
        plan_tier: c.plan_name,
        usage_score: health.usage_score,
        adoption_score: health.adoption_score,
        support_score: health.support_score,
        revenue_score: health.revenue_score,
        overall_score: health.overall_score,
        risk_level: health.risk_level,
        recommended_action: recommendedAction,
      };
    });

    const filtered = filterCardsByCompanyName(allCards, params.q);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const customers = filtered.slice(start, start + pageSize);

    return { customers, total };
  },
);

interface SegmentPredictionRow {
  segment_label: string;
  main_drivers: {
    usage_score: number;
    adoption_score: number;
    support_score: number;
    revenue_score: number;
    seat_penetration_score: number;
  };
}

interface SegmentSummary {
  segment_label: string;
  company_count: number;
  pct_of_total: number;
  avg_usage_score: number;
  avg_adoption_score: number;
  avg_support_score: number;
  avg_revenue_score: number;
  avg_seat_penetration_score: number;
}

const SEGMENT_ORDER = ["Power Users", "Expansion Opportunity", "High Value, Low Engagement", "At Risk"];

function averageMetric(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export const customerSegments = api(
  { method: "GET", path: "/customers/segments", expose: true },
  async (): Promise<{ segments: SegmentSummary[] }> => {
    await ensureSegmented();

    const rows: SegmentPredictionRow[] = [];
    for await (const r of db.query<{ segment_label: string; main_drivers: string }>`
      SELECT segment_label, main_drivers::text AS main_drivers
      FROM ml_predictions
      WHERE prediction_type = 'segment'
    `) {
      rows.push({ segment_label: r.segment_label, main_drivers: JSON.parse(r.main_drivers) });
    }

    const total = rows.length;
    const bySegment = new Map<string, SegmentPredictionRow[]>();
    for (const r of rows) {
      const arr = bySegment.get(r.segment_label) ?? [];
      arr.push(r);
      bySegment.set(r.segment_label, arr);
    }

    const segments: SegmentSummary[] = SEGMENT_ORDER.map((label) => {
      const members = bySegment.get(label) ?? [];
      return {
        segment_label: label,
        company_count: members.length,
        pct_of_total: total === 0 ? 0 : (members.length / total) * 100,
        avg_usage_score: averageMetric(members.map((m) => m.main_drivers.usage_score)),
        avg_adoption_score: averageMetric(members.map((m) => m.main_drivers.adoption_score)),
        avg_support_score: averageMetric(members.map((m) => m.main_drivers.support_score)),
        avg_revenue_score: averageMetric(members.map((m) => m.main_drivers.revenue_score)),
        avg_seat_penetration_score: averageMetric(members.map((m) => m.main_drivers.seat_penetration_score)),
      };
    });

    return { segments };
  },
);

interface ChurnPredictionRow {
  company_id: string;
  company_name: string;
  churn_probability: number;
  recommendation: string;
  main_drivers: string;
}

interface ChurnRiskCard {
  company_id: string;
  company_name: string;
  churn_probability: number;
  risk_level: string;
  primary_risk_driver: string;
  secondary_risk_driver: string;
  recommendation: string;
}

interface CustomerChurnRiskParams {
  page?: Query<number>;
  pageSize?: Query<number>;
  q?: Query<string>;
}

export const customerChurnRisk = api(
  { method: "GET", path: "/customers/churn-risk", expose: true },
  async (params: CustomerChurnRiskParams): Promise<{ companies: ChurnRiskCard[]; total: number }> => {
    await ensureChurnPredicted();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));

    const rows: ChurnPredictionRow[] = [];
    for await (const r of db.query<ChurnPredictionRow>`
      SELECT p.company_id, c.name AS company_name, p.churn_probability::float AS churn_probability,
        p.recommendation, p.main_drivers::text AS main_drivers
      FROM ml_predictions p
      JOIN companies c ON c.id = p.company_id
      WHERE p.prediction_type = 'churn_probability'
    `) {
      rows.push(r);
    }

    const allCards: ChurnRiskCard[] = rows
      .map((r) => {
        const drivers = JSON.parse(r.main_drivers);
        return {
          company_id: r.company_id,
          company_name: r.company_name,
          churn_probability: r.churn_probability,
          risk_level: drivers.risk_level,
          primary_risk_driver: drivers.primary_risk_driver,
          secondary_risk_driver: drivers.secondary_risk_driver,
          recommendation: r.recommendation,
        };
      })
      .sort((a, b) => b.churn_probability - a.churn_probability);

    const filtered = filterCardsByCompanyName(allCards, params.q);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const companies = filtered.slice(start, start + pageSize);

    return { companies, total };
  },
);

interface CompanyProfileParams {
  name: Query<string>;
}

// Encore's API metadata generator requires a named interface (not a union
// type alias) as an endpoint's response type, so `CompanyProfileResult`
// (a discriminated union, needed for ergonomic narrowing by callers like
// this task's own tests and Task 5's chatTools.ts) can't be used directly
// as this handler's declared return type. This wrapper interface adapts it
// to a shape Encore can parse while leaving `CompanyProfileResult` and
// `getCompanyProfile` untouched for non-HTTP callers.
interface CompanyProfileApiResponse {
  found: boolean;
  company: CompanyProfile | null;
}

export const companyProfile = api(
  { method: "GET", path: "/companies/profile", expose: true },
  async (params: CompanyProfileParams): Promise<CompanyProfileApiResponse> => {
    const result: CompanyProfileResult = await getCompanyProfile(params.name);
    return result.found ? { found: true, company: result.company } : { found: false, company: null };
  },
);
