import { describe, it, expect } from "vitest";
import { computeRevenueScore } from "./revenueScore";

describe("computeRevenueScore", () => {
  it("scores by plan tier: free=5, starter=12, professional=18, enterprise=25", () => {
    expect(computeRevenueScore({ plan_name: "free", status: "active" })).toBe(5);
    expect(computeRevenueScore({ plan_name: "starter", status: "active" })).toBe(12);
    expect(computeRevenueScore({ plan_name: "professional", status: "active" })).toBe(18);
    expect(computeRevenueScore({ plan_name: "enterprise", status: "active" })).toBe(25);
  });

  it("halves the score when status is past_due", () => {
    expect(computeRevenueScore({ plan_name: "enterprise", status: "past_due" })).toBe(12.5);
    expect(computeRevenueScore({ plan_name: "starter", status: "past_due" })).toBe(6);
  });

  it("does not halve for active or trialing status", () => {
    expect(computeRevenueScore({ plan_name: "professional", status: "trialing" })).toBe(18);
  });

  it("falls back to 0 for unrecognized plan names", () => {
    expect(computeRevenueScore({ plan_name: "unknown", status: "active" })).toBe(0);
    expect(computeRevenueScore({ plan_name: "premium", status: "active" })).toBe(0);
  });
});
