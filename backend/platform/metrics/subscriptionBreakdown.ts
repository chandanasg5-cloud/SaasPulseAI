import type { SubscriptionRow } from "./types";

export interface SubscriptionBreakdownRow {
  plan_tier: string;
  count: number;
  mrr: number;
}

const TIER_ORDER = ["free", "starter", "professional", "enterprise"];

export function computeSubscriptionBreakdown(subscriptions: SubscriptionRow[]): SubscriptionBreakdownRow[] {
  const active = subscriptions.filter((s) => s.status === "active");
  const byTier = new Map<string, { count: number; mrr: number }>();

  for (const sub of active) {
    const entry = byTier.get(sub.plan_name) ?? { count: 0, mrr: 0 };
    entry.count += 1;
    entry.mrr += sub.mrr_amount;
    byTier.set(sub.plan_name, entry);
  }

  return TIER_ORDER.filter((tier) => byTier.has(tier)).map((tier) => ({
    plan_tier: tier,
    ...byTier.get(tier)!,
  }));
}
