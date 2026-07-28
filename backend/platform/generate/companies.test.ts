import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";

describe("generateCompanies", () => {
  const now = new Date("2026-07-27");

  it("generates the requested count with unique ids", () => {
    const { companies } = generateCompanies(200, 1, now);
    expect(companies).toHaveLength(200);
    expect(new Set(companies.map((c) => c.id)).size).toBe(200);
  });

  it("produces one health profile per company, never exposed on the row", () => {
    const { companies, healthProfiles } = generateCompanies(200, 1, now);
    expect(healthProfiles).toHaveLength(200);
    const company = companies[0] as unknown as Record<string, unknown>;
    expect(company.healthFactor).toBeUndefined();
    expect(company.churnProbability).toBeUndefined();
  });

  it("skews plan tier toward free/starter", () => {
    const { companies } = generateCompanies(1000, 5, now);
    const freeOrStarter = companies.filter((c) => c.planTier === "free" || c.planTier === "starter").length;
    expect(freeOrStarter / companies.length).toBeGreaterThan(0.5);
  });

  it("keeps signup dates within the trailing 18 months", () => {
    const { companies } = generateCompanies(200, 2, now);
    const windowStart = new Date(now);
    windowStart.setMonth(windowStart.getMonth() - 18);
    for (const c of companies) {
      const signup = new Date(c.signupDate);
      expect(signup.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
      expect(signup.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});
