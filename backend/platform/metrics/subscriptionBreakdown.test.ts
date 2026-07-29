import { describe, it, expect } from "vitest";
import { computeSubscriptionBreakdown } from "./subscriptionBreakdown";
import type { SubscriptionRow } from "./types";

describe("computeSubscriptionBreakdown", () => {
  it("groups active subscriptions by plan tier with count and total MRR", () => {
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0002", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0003", plan_name: "enterprise", mrr_amount: 5000, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0004", plan_name: "professional", mrr_amount: 499, status: "canceled", start_date: "2026-01-01", end_date: "2026-05-01" },
    ];

    const breakdown = computeSubscriptionBreakdown(subscriptions);

    expect(breakdown).toEqual([
      { plan_tier: "starter", count: 2, mrr: 198 },
      { plan_tier: "enterprise", count: 1, mrr: 5000 },
    ]);
  });

  it("returns tiers in fixed order (free, starter, professional, enterprise), omitting empty ones", () => {
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "enterprise", mrr_amount: 5000, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0002", plan_name: "free", mrr_amount: 0, status: "active", start_date: "2026-01-01", end_date: null },
    ];
    const breakdown = computeSubscriptionBreakdown(subscriptions);
    expect(breakdown.map((b) => b.plan_tier)).toEqual(["free", "enterprise"]);
  });
});
