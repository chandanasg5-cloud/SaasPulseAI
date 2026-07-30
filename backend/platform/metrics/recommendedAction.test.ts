import { describe, it, expect } from "vitest";
import { computeRecommendedAction } from "./recommendedAction";
import { computeHealthScore } from "./healthScore";

describe("computeRecommendedAction", () => {
  it("suggests an upgrade discussion for low-risk accounts where revenue is the strongest sub-score", () => {
    const score = computeHealthScore(18, 18, 18, 25); // revenue clearly strongest, overall=79 -> low risk
    expect(computeRecommendedAction(score)).toBe("Consider enterprise upgrade discussion");
  });

  it("suggests maintaining touchpoints for low-risk accounts where revenue is NOT the strongest", () => {
    const score = computeHealthScore(25, 18, 18, 18); // usage strongest, overall=79 -> low risk
    expect(computeRecommendedAction(score)).toBe("Healthy account — maintain regular touchpoints");
  });

  it("recommends a feature adoption walkthrough for medium-risk accounts with weak adoption", () => {
    const score = computeHealthScore(15, 5, 15, 15); // adoption weakest, overall=50 -> medium risk
    expect(computeRecommendedAction(score)).toBe("Offer a feature adoption walkthrough to increase usage depth");
  });

  it("recommends urgent re-engagement for high-risk accounts with weak usage", () => {
    const score = computeHealthScore(2, 10, 10, 10); // usage weakest, overall=32 -> high risk
    expect(computeRecommendedAction(score)).toBe("Urgent: re-engagement campaign needed — usage has dropped significantly");
  });

  it("recommends an urgent support check-in for high-risk accounts with weak support", () => {
    const score = computeHealthScore(10, 10, 2, 10); // support weakest, overall=32 -> high risk
    expect(computeRecommendedAction(score)).toBe("Urgent: schedule a customer success check-in to resolve support issues");
  });

  it("breaks ties in fixed order usage -> adoption -> support -> revenue", () => {
    // usage and adoption tied at the weakest value; usage must win the tie
    const score = computeHealthScore(5, 5, 15, 15); // overall=40 -> medium risk
    expect(computeRecommendedAction(score)).toBe("Re-engagement outreach recommended — usage has softened");
  });
});
