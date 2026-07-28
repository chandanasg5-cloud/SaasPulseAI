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
});
