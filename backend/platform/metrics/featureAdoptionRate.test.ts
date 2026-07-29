import { describe, it, expect } from "vitest";
import { computeFeatureAdoptionRate } from "./featureAdoptionRate";
import type { ProductEventRow } from "./types";

describe("computeFeatureAdoptionRate", () => {
  const now = new Date(2026, 6, 30);

  it("is the percentage of active-in-last-30-days users who used 3+ distinct features", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-001", feature_name: "reports", timestamp: new Date(2026, 6, 26) },
      { user_id: "USR-001", feature_name: "api", timestamp: new Date(2026, 6, 27) },
      { user_id: "USR-002", feature_name: "dashboard", timestamp: new Date(2026, 6, 28) },
    ];
    // 2 active users in the trailing 30 days; only USR-001 has 3+ distinct features
    expect(computeFeatureAdoptionRate(events, now)).toBeCloseTo(50, 5);
  });

  it("excludes events older than 30 days from the active-user denominator", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-002", feature_name: "reports", timestamp: new Date(2026, 4, 1) }, // outside window
    ];
    expect(computeFeatureAdoptionRate(events, now)).toBe(0); // only USR-001 active, 1 feature
  });

  it("returns 0 when there are no active users", () => {
    expect(computeFeatureAdoptionRate([], now)).toBe(0);
  });
});
