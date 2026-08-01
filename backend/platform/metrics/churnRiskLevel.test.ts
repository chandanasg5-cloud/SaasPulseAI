import { describe, it, expect } from "vitest";
import { computeChurnRiskLevel } from "./churnRiskLevel";

describe("computeChurnRiskLevel", () => {
  it("bands >=0.5 as high", () => {
    expect(computeChurnRiskLevel(0.5)).toBe("high");
    expect(computeChurnRiskLevel(0.9)).toBe("high");
  });

  it("bands 0.2-0.49 as medium (inclusive lower bound)", () => {
    expect(computeChurnRiskLevel(0.2)).toBe("medium");
    expect(computeChurnRiskLevel(0.49)).toBe("medium");
  });

  it("bands <0.2 as low", () => {
    expect(computeChurnRiskLevel(0.19)).toBe("low");
    expect(computeChurnRiskLevel(0)).toBe("low");
  });
});
