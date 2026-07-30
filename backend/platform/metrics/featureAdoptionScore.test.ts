import { describe, it, expect } from "vitest";
import { computeFeatureAdoptionScore } from "./featureAdoptionScore";
import { computeFeatureAdoptionRate } from "./featureAdoptionRate";
import type { ProductEventRow } from "./types";

describe("computeFeatureAdoptionScore", () => {
  const now = new Date(2026, 6, 30);

  it("is computeFeatureAdoptionRate divided by 4 (0-100 rate -> 0-25 score)", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-001", feature_name: "reports", timestamp: new Date(2026, 6, 26) },
      { user_id: "USR-001", feature_name: "api", timestamp: new Date(2026, 6, 27) },
      { user_id: "USR-002", feature_name: "dashboard", timestamp: new Date(2026, 6, 28) },
    ];
    const rate = computeFeatureAdoptionRate(events, now);
    expect(computeFeatureAdoptionScore(events, now)).toBeCloseTo(rate / 4, 5);
    // Sanity-check the actual number too, not just the ratio to itself:
    // 2 active users, only USR-001 has 3+ distinct features -> rate = 50, score = 12.5
    expect(computeFeatureAdoptionScore(events, now)).toBeCloseTo(12.5, 5);
  });

  it("returns 0 when there are no active users", () => {
    expect(computeFeatureAdoptionScore([], now)).toBe(0);
  });
});
