import { describe, it, expect } from "vitest";
import { computeMrrTrend } from "./mrrTrend";
import type { SubscriptionEventRow } from "./types";

describe("computeMrrTrend", () => {
  it("accumulates mrr_change up to each month's end", () => {
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-05-10", event_type: "new_subscription", mrr_change: 100 },
      { company_id: "CMP-0002", event_date: "2026-06-05", event_type: "new_subscription", mrr_change: 200 },
      { company_id: "CMP-0001", event_date: "2026-06-20", event_type: "upgrade", mrr_change: 50 },
    ];
    const trend = computeMrrTrend(events, new Date(2026, 6, 15), 3);

    expect(trend.map((p) => p.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(trend[0].mrr).toBe(100);
    expect(trend[1].mrr).toBe(350);
    expect(trend[2].mrr).toBe(350);
  });

  it("ignores events dated after the trend window", () => {
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-08-01", event_type: "new_subscription", mrr_change: 999 },
    ];
    const trend = computeMrrTrend(events, new Date(2026, 6, 15), 1);
    expect(trend[0].mrr).toBe(0);
  });
});
