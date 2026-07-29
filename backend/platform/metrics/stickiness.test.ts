import { describe, it, expect } from "vitest";
import { computeStickiness } from "./stickiness";

describe("computeStickiness", () => {
  it("returns dau/mau as a percentage", () => {
    expect(computeStickiness(50, 200)).toBeCloseTo(25, 5);
  });

  it("returns 0 when mau is 0", () => {
    expect(computeStickiness(0, 0)).toBe(0);
  });
});
