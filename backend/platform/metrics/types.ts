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

export interface UserRow {
  id: string;
  company_id: string;
  first_login_at: Date | null;
  created_at: Date;
}

export interface ProductEventRow {
  user_id: string;
  feature_name: string | null;
  timestamp: Date;
}

export interface CompanyEventRow {
  company_id: string;
  user_id: string;
  feature_name: string | null;
  timestamp: Date;
}

export interface SupportTicketRow {
  company_id: string;
  priority: "low" | "medium" | "high" | "urgent";
  created_at: Date;
}
