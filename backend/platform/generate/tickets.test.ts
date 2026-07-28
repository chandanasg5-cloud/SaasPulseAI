import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateUsers } from "./users";
import { generateSubscriptionsAndEvents } from "./subscriptions";
import { generateSupportTickets } from "./tickets";

describe("generateSupportTickets", () => {
  const now = new Date("2026-07-27");

  it("generates unhealthy companies more tickets on average than healthy ones", () => {
    const { companies, healthProfiles } = generateCompanies(400, 51, now);
    const users = generateUsers(companies, 52, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 53, now);
    const tickets = generateSupportTickets(sub.companies, users, healthProfiles, 54, now);

    const byCompany = new Map<string, number>();
    for (const t of tickets) byCompany.set(t.companyId, (byCompany.get(t.companyId) ?? 0) + 1);

    const healthy = healthProfiles.filter((h) => h.healthFactor >= 70).map((h) => byCompany.get(h.companyId) ?? 0);
    const unhealthy = healthProfiles.filter((h) => h.healthFactor < 30).map((h) => byCompany.get(h.companyId) ?? 0);
    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;

    expect(avg(unhealthy)).toBeGreaterThan(avg(healthy));
  });

  it("ties each ticket's user_id to a user of the same company when one exists", () => {
    const { companies, healthProfiles } = generateCompanies(100, 55, now);
    const users = generateUsers(companies, 56, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 57, now);
    const tickets = generateSupportTickets(sub.companies, users, healthProfiles, 58, now);

    const usersByCompany = new Map<string, Set<string>>();
    for (const u of users) {
      const set = usersByCompany.get(u.companyId) ?? new Set<string>();
      set.add(u.id);
      usersByCompany.set(u.companyId, set);
    }
    for (const t of tickets) {
      if (t.userId) expect(usersByCompany.get(t.companyId)?.has(t.userId)).toBe(true);
    }
  });
});
