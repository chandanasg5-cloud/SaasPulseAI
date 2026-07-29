export interface MetricsOverview {
  total_companies: number;
  total_users: number;
  total_events: number;
  current_mrr: number;
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
