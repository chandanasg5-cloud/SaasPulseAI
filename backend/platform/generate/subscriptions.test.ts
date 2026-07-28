import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateSubscriptionsAndEvents } from "./subscriptions";

describe("generateSubscriptionsAndEvents", () => {
  const now = new Date("2026-07-27");

  it("creates exactly one subscription and a new_subscription event per company", () => {
    const { companies, healthProfiles } = generateCompanies(500, 21, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 22, now);
    expect(result.subscriptions).toHaveLength(500);
    const newSubEvents = result.events.filter((e) => e.eventType === "new_subscription");
    expect(newSubEvents).toHaveLength(500);
  });

  it("marks canceled subscriptions as churned with a matching cancellation event", () => {
    const { companies, healthProfiles } = generateCompanies(500, 23, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 24, now);
    const canceled = result.subscriptions.filter((s) => s.status === "canceled");
    expect(canceled.length).toBeGreaterThan(0);
    for (const sub of canceled) {
      expect(sub.endDate).not.toBeNull();
      const cancelEvent = result.events.find(
        (e) => e.companyId === sub.companyId && e.eventType === "cancellation",
      );
      expect(cancelEvent).toBeDefined();
    }
  });

  it("finalizes customer_stage to 'churned' exactly for canceled companies", () => {
    const { companies, healthProfiles } = generateCompanies(500, 25, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 26, now);
    const churnedCompanyIds = new Set(
      result.subscriptions.filter((s) => s.status === "canceled").map((s) => s.companyId),
    );
    for (const c of result.companies) {
      expect(c.customerStage === "churned").toBe(churnedCompanyIds.has(c.id));
    }
  });

  it("moves upgrade/downgrade events to a genuinely different tier along the ladder, and never downgrades a free-tier company", () => {
    const TIER_INDEX: Record<string, number> = { free: 0, starter: 1, professional: 2, enterprise: 3 };
    const { companies, healthProfiles } = generateCompanies(500, 27, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 28, now);

    const upgrades = result.events.filter((e) => e.eventType === "upgrade");
    const downgrades = result.events.filter((e) => e.eventType === "downgrade");
    expect(upgrades.length + downgrades.length).toBeGreaterThan(0);

    for (const e of upgrades) {
      expect(e.previousPlan).not.toBeNull();
      expect(e.newPlan).not.toBeNull();
      expect(e.newPlan).not.toBe(e.previousPlan);
      expect(TIER_INDEX[e.newPlan!]).toBe(TIER_INDEX[e.previousPlan!] + 1);
      expect(e.mrrChange).toBeGreaterThan(0);
    }

    for (const e of downgrades) {
      expect(e.previousPlan).not.toBeNull();
      expect(e.newPlan).not.toBeNull();
      expect(e.previousPlan).not.toBe("free");
      expect(e.newPlan).not.toBe(e.previousPlan);
      expect(TIER_INDEX[e.newPlan!]).toBe(TIER_INDEX[e.previousPlan!] - 1);
      expect(e.mrrChange).toBeLessThan(0);
    }
  });
});
