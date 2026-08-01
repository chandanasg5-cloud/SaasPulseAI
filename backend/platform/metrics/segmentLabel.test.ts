import { describe, it, expect } from "vitest";
import { computeSegmentLabels, type SegmentCentroid } from "./segmentLabel";

describe("computeSegmentLabels", () => {
  const centroids: SegmentCentroid[] = [
    { cluster_id: 0, usage_score: 23, adoption_score: 22, support_score: 20, revenue_score: 21, seat_penetration_score: 22 },
    { cluster_id: 1, usage_score: 5, adoption_score: 5, support_score: 8, revenue_score: 5, seat_penetration_score: 5 },
    { cluster_id: 2, usage_score: 6, adoption_score: 6, support_score: 14, revenue_score: 24, seat_penetration_score: 6 },
    { cluster_id: 3, usage_score: 20, adoption_score: 19, support_score: 14, revenue_score: 7, seat_penetration_score: 19 },
  ];

  it("assigns all 4 fixed personas correctly", () => {
    const labels = computeSegmentLabels(centroids);
    expect(labels.get(0)).toBe("Power Users");
    expect(labels.get(1)).toBe("At Risk");
    expect(labels.get(2)).toBe("High Value, Low Engagement");
    expect(labels.get(3)).toBe("Expansion Opportunity");
  });

  it("tie-breaks equal revenue-engagement gaps by higher raw revenue_score", () => {
    const tiedCentroids: SegmentCentroid[] = [
      { cluster_id: 0, usage_score: 23, adoption_score: 22, support_score: 20, revenue_score: 21, seat_penetration_score: 22 },
      { cluster_id: 1, usage_score: 5, adoption_score: 5, support_score: 8, revenue_score: 5, seat_penetration_score: 5 },
      { cluster_id: 2, usage_score: 12, adoption_score: 12, support_score: 12, revenue_score: 16, seat_penetration_score: 12 },
      { cluster_id: 3, usage_score: 11, adoption_score: 11, support_score: 12, revenue_score: 15, seat_penetration_score: 11 },
    ];
    // cluster 2's gap: 16 - (12+12+12)/3 = 4. cluster 3's gap: 15 - (11+11+11)/3 = 4. Tied.
    // Tie-break: higher raw revenue_score (16 > 15) -> cluster 2 becomes "High Value, Low Engagement".
    const labels = computeSegmentLabels(tiedCentroids);
    expect(labels.get(2)).toBe("High Value, Low Engagement");
    expect(labels.get(3)).toBe("Expansion Opportunity");
  });
});
