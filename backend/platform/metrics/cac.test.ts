import { describe, it, expect } from "vitest";
import { computeCac } from "./cac";
import type { MarketingSpendRow, SubscriptionEventRow } from "./types";

describe("computeCac", () => {
  it("divides this month's spend by this month's new paying customers", () => {
    const now = new Date(2026, 6, 15); // July
    const spend: MarketingSpendRow[] = [
      { month: "2026-06-01", amount: 1000 },
      { month: "2026-07-01", amount: 3000 },
    ];
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-07-05", event_type: "new_subscription", mrr_change: 99 },
      { company_id: "CMP-0002", event_date: "2026-07-10", event_type: "new_subscription", mrr_change: 499 },
      { company_id: "CMP-0003", event_date: "2026-07-12", event_type: "new_subscription", mrr_change: 0 }, // free tier, excluded
      { company_id: "CMP-0004", event_date: "2026-06-01", event_type: "new_subscription", mrr_change: 99 }, // wrong month, excluded
    ];

    expect(computeCac(spend, events, now)).toBe(3000 / 2);
  });

  it("returns 0 when there are no new paying customers this month", () => {
    const now = new Date(2026, 6, 15);
    expect(computeCac([{ month: "2026-07-01", amount: 500 }], [], now)).toBe(0);
  });
});
