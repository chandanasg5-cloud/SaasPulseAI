import type { SubscriptionRow } from "./types";

export function computeClv(subscriptions: SubscriptionRow[], monthlyChurnRate: number): number {
  const paying = subscriptions.filter((s) => s.status === "active" && s.mrr_amount > 0);
  if (paying.length === 0 || monthlyChurnRate === 0) return 0;

  const arpu = paying.reduce((sum, s) => sum + s.mrr_amount, 0) / paying.length;
  return arpu / monthlyChurnRate;
}
