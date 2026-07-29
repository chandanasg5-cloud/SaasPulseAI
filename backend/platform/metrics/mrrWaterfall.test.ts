import { describe, it, expect } from "vitest";
import { computeMrrWaterfall } from "./mrrWaterfall";
import type { SubscriptionEventRow } from "./types";

describe("computeMrrWaterfall", () => {
  it("splits the current month's events by type and sums a prior starting balance", () => {
    const now = new Date(2026, 6, 15); // July 2026
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-05-01", event_type: "new_subscription", mrr_change: 500 },
      { company_id: "CMP-0002", event_date: "2026-07-05", event_type: "new_subscription", mrr_change: 100 },
      { company_id: "CMP-0001", event_date: "2026-07-10", event_type: "upgrade", mrr_change: 50 },
      { company_id: "CMP-0003", event_date: "2026-06-01", event_type: "new_subscription", mrr_change: 200 },
      { company_id: "CMP-0003", event_date: "2026-07-12", event_type: "downgrade", mrr_change: -80 },
      { company_id: "CMP-0004", event_date: "2026-06-01", event_type: "new_subscription", mrr_change: 300 },
      { company_id: "CMP-0004", event_date: "2026-07-20", event_type: "cancellation", mrr_change: -300 },
    ];

    const waterfall = computeMrrWaterfall(events, now);

    expect(waterfall.starting_mrr).toBe(1000); // 500 + 200 + 300 (all before July)
    expect(waterfall.new_mrr).toBe(100);
    expect(waterfall.expansion_mrr).toBe(50);
    expect(waterfall.contraction_mrr).toBe(-80);
    expect(waterfall.churned_mrr).toBe(-300);
    expect(waterfall.ending_mrr).toBe(1000 + 100 + 50 - 80 - 300);
  });

  it("excludes renewal events from every bucket (mrr_change is always 0 for renewals)", () => {
    const now = new Date(2026, 6, 15);
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-07-05", event_type: "renewal", mrr_change: 0 },
    ];
    const waterfall = computeMrrWaterfall(events, now);
    expect(waterfall.new_mrr).toBe(0);
    expect(waterfall.expansion_mrr).toBe(0);
    expect(waterfall.contraction_mrr).toBe(0);
    expect(waterfall.churned_mrr).toBe(0);
  });
});
