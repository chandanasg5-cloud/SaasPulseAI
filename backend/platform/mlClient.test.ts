import { describe, it, expect } from "vitest";
import { callClusterService, callChurnPredictionService } from "./mlClient";

describe("callClusterService", () => {
  it("calls the real ml-service and returns assignments, centroids, and metadata", async () => {
    const companies = [
      { company_id: "T-A1", usage_score: 24, adoption_score: 23, support_score: 20, revenue_score: 22, seat_penetration_score: 23 },
      { company_id: "T-A2", usage_score: 23, adoption_score: 22, support_score: 19, revenue_score: 23, seat_penetration_score: 22 },
      { company_id: "T-B1", usage_score: 4, adoption_score: 3, support_score: 22, revenue_score: 5, seat_penetration_score: 4 },
      { company_id: "T-B2", usage_score: 3, adoption_score: 4, support_score: 21, revenue_score: 4, seat_penetration_score: 3 },
      { company_id: "T-C1", usage_score: 22, adoption_score: 20, support_score: 15, revenue_score: 6, seat_penetration_score: 21 },
      { company_id: "T-C2", usage_score: 21, adoption_score: 21, support_score: 14, revenue_score: 5, seat_penetration_score: 20 },
      { company_id: "T-D1", usage_score: 5, adoption_score: 4, support_score: 12, revenue_score: 24, seat_penetration_score: 5 },
      { company_id: "T-D2", usage_score: 4, adoption_score: 5, support_score: 13, revenue_score: 23, seat_penetration_score: 4 },
    ];

    const result = await callClusterService(companies);

    expect(result.assignments).toHaveLength(8);
    expect(new Set(result.assignments.map((a) => a.company_id))).toEqual(
      new Set(companies.map((c) => c.company_id)),
    );
    expect(result.centroids).toHaveLength(4);
    for (const centroid of result.centroids) {
      expect(typeof centroid.usage_score).toBe("number");
      expect(typeof centroid.adoption_score).toBe("number");
      expect(typeof centroid.support_score).toBe("number");
      expect(typeof centroid.revenue_score).toBe("number");
      expect(typeof centroid.seat_penetration_score).toBe("number");
    }
    expect(result.metadata.algorithm).toBe("kmeans");
    expect(result.metadata.random_seed).toBe(42);
  });
});

describe("callChurnPredictionService", () => {
  it("calls the real ml-service and returns predictions, importances, and metadata", async () => {
    const companies = [
      ...Array.from({ length: 15 }, (_, i) => ({
        company_id: `H-${i}`, usage_score: 22, adoption_score: 21, support_score: 20,
        revenue_score: 18, seat_penetration_score: 20, tenure_days: 400, recency_days: 2,
        churned: false,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        company_id: `R-${i}`, usage_score: 3, adoption_score: 4, support_score: 10,
        revenue_score: 5, seat_penetration_score: 3, tenure_days: 40, recency_days: 60,
        churned: true,
      })),
    ];

    const result = await callChurnPredictionService(companies);

    expect(result.predictions).toHaveLength(20);
    for (const p of result.predictions) {
      expect(p.churn_probability).toBeGreaterThanOrEqual(0);
      expect(p.churn_probability).toBeLessThanOrEqual(1);
    }
    expect(result.metadata.algorithm).toBe("xgboost");
    expect(result.metadata.random_seed).toBe(42);
    expect(typeof result.metadata.held_out_metrics.accuracy).toBe("number");
    expect(typeof result.feature_importances.usage_score).toBe("number");
  });
});
