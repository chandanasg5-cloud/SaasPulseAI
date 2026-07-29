export interface ExecutiveKpis {
  mrr: number;
  arr: number;
  revenue_growth_pct: number;
  customer_count: number;
  cac: number;
  clv: number;
  churn_rate_pct: number;
  nrr_pct: number;
}

export interface RevenueTrendPoint {
  month: string;
  mrr: number;
}

export interface MrrWaterfall {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

export interface CustomerGrowthPoint {
  month: string;
  active_customers: number;
}

export interface SubscriptionBreakdownRow {
  plan_tier: string;
  count: number;
  mrr: number;
}

export interface ExecutiveOverview {
  kpis: ExecutiveKpis;
  charts: {
    revenue_trend: RevenueTrendPoint[];
    mrr_waterfall: MrrWaterfall;
    customer_growth: CustomerGrowthPoint[];
    subscription_breakdown: SubscriptionBreakdownRow[];
  };
}

export interface CompanySummary {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  customer_stage: string;
  mrr: number;
}

export interface CompaniesResponse {
  companies: CompanySummary[];
  total: number;
}
