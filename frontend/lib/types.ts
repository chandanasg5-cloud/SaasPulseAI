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

export interface ProductKpis {
  dau: number;
  wau: number;
  mau: number;
  stickiness_pct: number;
  feature_adoption_pct: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface FeatureUsageRow {
  feature_name: string;
  event_count: number;
}

export interface EngagementTrendPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface CohortRetentionCell {
  cohort_month: string;
  months_since_signup: number;
  retention_pct: number;
}

export interface ProductOverview {
  kpis: ProductKpis;
  funnel: FunnelStage[];
  charts: {
    feature_usage_ranking: FeatureUsageRow[];
    engagement_trend: EngagementTrendPoint[];
    cohort_retention: CohortRetentionCell[];
  };
}

export interface CustomerHealthCard {
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

export interface CustomerHealthScoresResponse {
  customers: CustomerHealthCard[];
  total: number;
}

export interface SegmentSummary {
  segment_label: string;
  company_count: number;
  pct_of_total: number;
  avg_usage_score: number;
  avg_adoption_score: number;
  avg_support_score: number;
  avg_revenue_score: number;
  avg_seat_penetration_score: number;
}

export interface SegmentsResponse {
  segments: SegmentSummary[];
}
