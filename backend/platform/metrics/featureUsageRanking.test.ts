import { describe, it, expect } from "vitest";
import { computeFeatureUsageRanking } from "./featureUsageRanking";
import type { ProductEventRow } from "./types";

describe("computeFeatureUsageRanking", () => {
  it("counts events per feature and sorts descending", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-003", feature_name: "reports", timestamp: new Date() },
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date() },
      { user_id: "USR-002", feature_name: "dashboard", timestamp: new Date() },
      { user_id: "USR-001", feature_name: null, timestamp: new Date() }, // no feature, excluded
    ];
    const ranking = computeFeatureUsageRanking(events);
    expect(ranking).toEqual([
      { feature_name: "dashboard", event_count: 2 },
      { feature_name: "reports", event_count: 1 },
    ]);
  });

  it("returns an empty array when there are no feature-tagged events", () => {
    expect(computeFeatureUsageRanking([])).toEqual([]);
  });
});
