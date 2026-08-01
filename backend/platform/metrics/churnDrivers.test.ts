import { describe, it, expect } from "vitest";
import { computeChurnDrivers, type ChurnFeatureVector, type FeatureImportances } from "./churnDrivers";

describe("computeChurnDrivers", () => {
  const populationAverages: ChurnFeatureVector = {
    usage_score: 15, adoption_score: 15, support_score: 15, revenue_score: 15,
    seat_penetration_score: 15, tenure_days: 300, recency_days: 10,
  };
  const importances: FeatureImportances = {
    usage_score: 0.3, adoption_score: 0.1, support_score: 0.1, revenue_score: 0.1,
    seat_penetration_score: 0.1, tenure_days: 0.1, recency_days: 0.2,
  };

  it("picks the two largest weighted risk contributions", () => {
    const companyFeatures: ChurnFeatureVector = {
      usage_score: 5, // below avg by 10, importance 0.3 -> contribution 3.0 (largest)
      adoption_score: 15,
      support_score: 15,
      revenue_score: 15,
      seat_penetration_score: 15,
      tenure_days: 300,
      recency_days: 20, // above avg by 10, importance 0.2 -> contribution 2.0 (2nd largest)
    };
    const result = computeChurnDrivers(companyFeatures, populationAverages, importances);
    expect(result.primary_risk_driver).toBe("Low Product Usage");
    expect(result.secondary_risk_driver).toBe("Inactive Recently");
  });

  it("tie-breaks equal weighted contributions by fixed feature order", () => {
    const companyFeatures: ChurnFeatureVector = {
      usage_score: 15, adoption_score: 15,
      support_score: 5, // below avg by 10, importance 0.1 -> contribution 1.0
      revenue_score: 5, // below avg by 10, importance 0.1 -> contribution 1.0 (tied)
      seat_penetration_score: 15, tenure_days: 300, recency_days: 10,
    };
    const result = computeChurnDrivers(companyFeatures, populationAverages, importances);
    // support_score precedes revenue_score in the fixed feature order -> support wins
    expect(result.primary_risk_driver).toBe("Elevated Support Activity");
    expect(result.secondary_risk_driver).toBe("Low Plan Value");
  });

  it("correctly inverts recency_days direction (above average increases risk)", () => {
    const companyFeatures: ChurnFeatureVector = {
      usage_score: 15, adoption_score: 15, support_score: 15, revenue_score: 15,
      seat_penetration_score: 15, tenure_days: 300,
      recency_days: 100, // far above avg (10) -> high risk contribution
    };
    const result = computeChurnDrivers(companyFeatures, populationAverages, importances);
    expect(result.primary_risk_driver).toBe("Inactive Recently");
  });
});
