import { describe, it, expect } from "vitest";
import { computeClv } from "./clv";
import type { SubscriptionRow } from "./types";

describe("computeClv", () => {
  it("divides ARPU (paying customers only) by monthly churn rate", () => {
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 100, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0002", plan_name: "professional", mrr_amount: 500, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0003", plan_name: "free", mrr_amount: 0, status: "active", start_date: "2026-01-01", end_date: null },
    ];
    // ARPU over paying customers only: (100 + 500) / 2 = 300
    expect(computeClv(subscriptions, 0.05)).toBeCloseTo(300 / 0.05, 5);
  });

  it("returns 0 when churn rate is 0 or there are no paying customers", () => {
    expect(computeClv([], 0.05)).toBe(0);
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 100, status: "active", start_date: "2026-01-01", end_date: null },
    ];
    expect(computeClv(subscriptions, 0)).toBe(0);
  });
});
