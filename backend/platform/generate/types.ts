export type PlanTier = "free" | "starter" | "professional" | "enterprise";
export type CustomerStage =
  | "trial" | "onboarding" | "active" | "growing" | "power_user" | "at_risk" | "churned";
export type SubscriptionStatus = "active" | "canceled" | "trialing" | "past_due";
export type BillingCycle = "monthly" | "annual";
export type SubscriptionEventType =
  | "new_subscription" | "upgrade" | "downgrade" | "cancellation" | "renewal";
export type DeviceType = "desktop" | "mobile" | "tablet";

export interface HealthProfile {
  companyId: string;
  healthFactor: number;
  churnProbability: number;
}

export interface CompanyRow {
  id: string;
  name: string;
  industry: string;
  companySize: number;
  planTier: PlanTier;
  customerStage: CustomerStage;
  signupDate: string;
}

export interface UserRow {
  id: string;
  companyId: string;
  email: string;
  role: string;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SubscriptionRow {
  id: string;
  companyId: string;
  planName: PlanTier;
  mrrAmount: number;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
}

export interface SubscriptionEventRow {
  id: string;
  companyId: string;
  eventDate: string;
  eventType: SubscriptionEventType;
  previousPlan: PlanTier | null;
  newPlan: PlanTier | null;
  mrrChange: number;
}

export interface ProductEventRow {
  id: string;
  userId: string;
  companyId: string;
  timestamp: string;
  eventName: string;
  featureName: string | null;
  sessionDuration: number;
  deviceType: DeviceType;
}

export interface SupportTicketRow {
  id: string;
  companyId: string;
  userId: string | null;
  subject: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "closed" | "pending";
  createdAt: string;
  resolvedAt: string | null;
}
