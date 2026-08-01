import { describe, it, expect } from "vitest";
import { computeTenureDays, computeRecencyDays } from "./churnFeatures";
import type { ProductEventRow } from "./types";

describe("computeTenureDays", () => {
  it("computes whole days between signup and now", () => {
    const signup = new Date(2026, 0, 1);
    const now = new Date(2026, 0, 31);
    expect(computeTenureDays(signup, now)).toBe(30);
  });

  it("returns 0 if signup date is somehow after now (defensive)", () => {
    const signup = new Date(2026, 1, 1);
    const now = new Date(2026, 0, 1);
    expect(computeTenureDays(signup, now)).toBe(0);
  });
});

describe("computeRecencyDays", () => {
  const now = new Date(2026, 6, 30);

  it("computes days since the most recent event", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-1", feature_name: null, timestamp: new Date(2026, 6, 20) },
      { user_id: "USR-1", feature_name: null, timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-1", feature_name: null, timestamp: new Date(2026, 6, 10) },
    ];
    // most recent event is 2026-07-25, now is 2026-07-30 -> 5 days
    expect(computeRecencyDays(events, 200, now)).toBe(5);
  });

  it("falls back to tenure_days when there are no events", () => {
    expect(computeRecencyDays([], 42, now)).toBe(42);
  });
});
