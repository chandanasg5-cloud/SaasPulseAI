export interface CompanyRow {
  id: string;
  signup_date: string;
}

export interface SubscriptionRow {
  company_id: string;
  plan_name: string;
  mrr_amount: number;
  status: "active" | "canceled" | "trialing" | "past_due";
  start_date: string;
  end_date: string | null;
}

export type SubscriptionEventType = "new_subscription" | "upgrade" | "downgrade" | "cancellation" | "renewal";

export interface SubscriptionEventRow {
  company_id: string;
  event_date: string;
  event_type: SubscriptionEventType;
  mrr_change: number;
}

export interface MarketingSpendRow {
  month: string;
  amount: number;
}
