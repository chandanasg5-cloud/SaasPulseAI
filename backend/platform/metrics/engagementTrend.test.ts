import { describe, it, expect } from "vitest";
import { computeEngagementTrend } from "./engagementTrend";
import type { ProductEventRow } from "./types";

describe("computeEngagementTrend", () => {
  const now = new Date(2026, 6, 30, 12, 0, 0); // July 30, 2026, midday

  it("returns dayCount points, oldest first, dates as YYYY-MM-DD", () => {
    const trend = computeEngagementTrend([], now, 5);
    expect(trend).toHaveLength(5);
    expect(trend.map((p) => p.date)).toEqual([
      "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
    ]);
  });

  it("counts distinct users active within each window ending on that day", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 6, 30, 9, 0) }, // today
      { user_id: "USR-002", feature_name: null, timestamp: new Date(2026, 6, 25, 9, 0) }, // 5 days ago — within WAU/MAU window of the last day, not DAU
      { user_id: "USR-003", feature_name: null, timestamp: new Date(2026, 5, 1, 9, 0) },  // June 1 — outside a 30-day window ending July 30
    ];
    const trend = computeEngagementTrend(events, now, 30);
    const lastPoint = trend[trend.length - 1];

    expect(lastPoint.dau).toBe(1); // only USR-001 active "today"
    expect(lastPoint.wau).toBe(2); // USR-001 + USR-002 (5 days ago is within trailing 7)
    expect(lastPoint.mau).toBe(2); // USR-003's June 1 event is outside the trailing-30-day window ending July 30
  });

  it("a user active only on day 1 of a 30-day window no longer counts in a later day's DAU", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 6, 1, 9, 0) },
    ];
    const trend = computeEngagementTrend(events, now, 30);
    const firstPoint = trend[0]; // 2026-07-01 (30 days before/including July 30, starts July 1)
    const lastPoint = trend[trend.length - 1];

    expect(firstPoint.dau).toBe(1);
    expect(lastPoint.dau).toBe(0);
  });
});
