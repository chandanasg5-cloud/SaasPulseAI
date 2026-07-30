import { describe, it, expect } from "vitest";
import { computeHealthScore } from "./healthScore";

describe("computeHealthScore", () => {
  it("sums the 4 sub-scores into overall_score", () => {
    const result = computeHealthScore(20, 15, 22, 18);
    expect(result.overall_score).toBe(75);
    expect(result.usage_score).toBe(20);
    expect(result.adoption_score).toBe(15);
    expect(result.support_score).toBe(22);
    expect(result.revenue_score).toBe(18);
  });

  it("bands risk_level: >=70 low, 40-69 medium, <40 high (inclusive boundaries)", () => {
    expect(computeHealthScore(20, 20, 20, 10).overall_score).toBe(70);
    expect(computeHealthScore(20, 20, 20, 10).risk_level).toBe("low"); // exactly 70 -> low
    expect(computeHealthScore(10, 10, 10, 10).overall_score).toBe(40);
    expect(computeHealthScore(10, 10, 10, 10).risk_level).toBe("medium"); // exactly 40 -> medium
    expect(computeHealthScore(10, 10, 9, 9).overall_score).toBe(38);
    expect(computeHealthScore(10, 10, 9, 9).risk_level).toBe("high"); // 39 or below -> high
  });
});
