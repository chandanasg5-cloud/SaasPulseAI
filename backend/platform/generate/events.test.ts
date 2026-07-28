// backend/platform/generate/events.test.ts
import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateUsers } from "./users";
import { generateSubscriptionsAndEvents } from "./subscriptions";
import { generateProductEvents } from "./events";

describe("generateProductEvents", () => {
  const now = new Date("2026-07-27");

  it("generates exactly the requested total, all with unique ids", () => {
    const { companies, healthProfiles } = generateCompanies(200, 31, now);
    const users = generateUsers(companies, 32, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 33, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 5000, 34, now);

    expect(events).toHaveLength(5000);
    expect(new Set(events.map((e) => e.id)).size).toBe(5000);
  });

  it("gives healthier companies' users more events on average", () => {
    const { companies, healthProfiles } = generateCompanies(300, 35, now);
    const users = generateUsers(companies, 36, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 37, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 20000, 38, now);

    const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h.healthFactor]));
    const eventsByUser = new Map<string, number>();
    for (const e of events) eventsByUser.set(e.userId, (eventsByUser.get(e.userId) ?? 0) + 1);

    let healthySum = 0, healthyCount = 0, unhealthySum = 0, unhealthyCount = 0;
    for (const u of users) {
      const health = healthByCompany.get(u.companyId)!;
      const count = eventsByUser.get(u.id) ?? 0;
      if (health >= 70) { healthySum += count; healthyCount++; }
      else if (health < 30) { unhealthySum += count; unhealthyCount++; }
    }

    expect(healthySum / healthyCount).toBeGreaterThan(unhealthySum / unhealthyCount);
  });

  it("only uses event names from the known catalog", () => {
    const { companies, healthProfiles } = generateCompanies(50, 39, now);
    const users = generateUsers(companies, 40, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 41, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 1000, 42, now);

    const known = new Set([
      "user_login", "user_logout", "dashboard_viewed", "report_created", "report_exported",
      "analytics_viewed", "data_uploaded", "integration_connected", "automation_created",
      "workflow_created", "api_call", "team_member_invited", "billing_page_viewed",
      "pricing_page_viewed", "help_center_viewed", "support_requested",
    ]);
    for (const e of events) expect(known.has(e.eventName)).toBe(true);
  });

  it("generates exactly 1000 events with unique IDs", () => {
    const { companies, healthProfiles } = generateCompanies(50, 43, now);
    const users = generateUsers(companies, 44, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 45, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 1000, 46, now);

    expect(events).toHaveLength(1000);
    expect(new Set(events.map((e) => e.id)).size).toBe(1000);
  });

  it("generates exactly 20000 events with unique IDs", () => {
    const { companies, healthProfiles } = generateCompanies(300, 47, now);
    const users = generateUsers(companies, 48, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 49, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 20000, 50, now);

    expect(events).toHaveLength(20000);
    expect(new Set(events.map((e) => e.id)).size).toBe(20000);
  });

  it("ensures all timestamps fall within the active window", () => {
    const { companies, healthProfiles } = generateCompanies(50, 51, now);
    const users = generateUsers(companies, 52, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 53, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 2000, 54, now);

    const windowStart = new Date(now);
    windowStart.setMonth(windowStart.getMonth() - 12);

    for (const e of events) {
      const timestamp = new Date(e.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("includes all event fields correctly", () => {
    const { companies, healthProfiles } = generateCompanies(20, 55, now);
    const users = generateUsers(companies, 56, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 57, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 500, 58, now);

    for (const e of events) {
      expect(e.id).toBeDefined();
      expect(e.userId).toBeDefined();
      expect(e.companyId).toBeDefined();
      expect(e.timestamp).toBeDefined();
      expect(e.eventName).toBeDefined();
      expect(e.sessionDuration).toBeGreaterThanOrEqual(30);
      expect(e.sessionDuration).toBeLessThanOrEqual(1800);
      expect(["desktop", "mobile", "tablet"]).toContain(e.deviceType);
    }
  });
});
