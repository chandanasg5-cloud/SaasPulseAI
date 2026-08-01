// backend/platform/metrics/segmentDrivers.test.ts
import { describe, it, expect } from "vitest";
import { computeSegmentDrivers, type ScoreVector } from "./segmentDrivers";

describe("computeSegmentDrivers", () => {
  const populationAverages: ScoreVector = {
    usage_score: 15,
    adoption_score: 15,
    support_score: 15,
    revenue_score: 15,
    seat_penetration_score: 15,
  };

  it("picks the two largest positive deviations as primary/secondary drivers", () => {
    const companyScores: ScoreVector = {
      usage_score: 23, // +8
      adoption_score: 20, // +5
      support_score: 16, // +1
      revenue_score: 14, // -1
      seat_penetration_score: 12, // -3
    };
    const result = computeSegmentDrivers(companyScores, populationAverages);
    expect(result.primary_driver).toBe("High Product Usage");
    expect(result.secondary_driver).toBe("Strong Feature Adoption");
  });

  it("tie-breaks equal deviations by fixed order usage > adoption > support > revenue > seat_penetration", () => {
    const companyScores: ScoreVector = {
      usage_score: 15, // +0
      adoption_score: 15, // +0
      support_score: 20, // +5
      revenue_score: 20, // +5 (tied with support)
      seat_penetration_score: 10, // -5
    };
    const result = computeSegmentDrivers(companyScores, populationAverages);
    expect(result.primary_driver).toBe("Low Support Burden");
    expect(result.secondary_driver).toBe("High Plan Value");
  });
});
