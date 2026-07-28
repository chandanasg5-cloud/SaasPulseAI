import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateUsers } from "./users";

describe("generateUsers", () => {
  const now = new Date("2026-07-27");

  it("generates at least one user per company, all with unique ids", () => {
    const { companies } = generateCompanies(100, 11, now);
    const users = generateUsers(companies, 12, now);
    expect(new Set(users.map((u) => u.id)).size).toBe(users.length);

    const byCompany = new Map<string, number>();
    for (const u of users) byCompany.set(u.companyId, (byCompany.get(u.companyId) ?? 0) + 1);
    for (const c of companies) expect(byCompany.get(c.id) ?? 0).toBeGreaterThan(0);
  });

  it("gives enterprise companies more seats on average than free companies", () => {
    const { companies } = generateCompanies(500, 13, now);
    const users = generateUsers(companies, 14, now);
    const byCompany = new Map<string, number>();
    for (const u of users) byCompany.set(u.companyId, (byCompany.get(u.companyId) ?? 0) + 1);

    const avg = (tier: string) => {
      const ids = companies.filter((c) => c.planTier === tier).map((c) => c.id);
      const counts = ids.map((id) => byCompany.get(id) ?? 0);
      return counts.reduce((s, n) => s + n, 0) / counts.length;
    };

    expect(avg("enterprise")).toBeGreaterThan(avg("free"));
  });
});
