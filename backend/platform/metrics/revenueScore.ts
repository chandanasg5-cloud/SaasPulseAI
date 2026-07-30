export interface RevenueScoreInput {
  plan_name: string;
  status: string;
}

const TIER_BASE_POINTS: Record<string, number> = {
  free: 5,
  starter: 12,
  professional: 18,
  enterprise: 25,
};

export function computeRevenueScore(subscription: RevenueScoreInput): number {
  const base = TIER_BASE_POINTS[subscription.plan_name] ?? 0;
  return subscription.status === "past_due" ? base / 2 : base;
}
