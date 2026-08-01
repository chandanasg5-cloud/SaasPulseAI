import { describe, it, expect } from "vitest";
import { computeChurnRecommendedAction } from "./churnRecommendedAction";

describe("computeChurnRecommendedAction", () => {
  it("returns the healthy message for low risk regardless of driver", () => {
    expect(computeChurnRecommendedAction("low", "Low Product Usage")).toBe(
      "Healthy account — low churn risk, maintain regular touchpoints",
    );
  });

  it("returns non-urgent, driver-specific text for medium risk", () => {
    expect(computeChurnRecommendedAction("medium", "Inactive Recently")).toBe(
      "Reach out — no recent product activity detected",
    );
  });

  it("returns urgent, driver-specific text for high risk", () => {
    expect(computeChurnRecommendedAction("high", "Short Tenure")).toBe(
      "Urgent: high churn risk during onboarding — assign a dedicated success contact",
    );
  });

  it("falls back gracefully for an unrecognized driver", () => {
    expect(computeChurnRecommendedAction("high", "Something Unexpected")).toBe(
      "Urgent: review account health — elevated churn risk detected",
    );
  });
});
