import { describe, it, expect } from "vitest";
import { health, companiesCount, listCompanies, metricsOverview } from "./api";

describe("health", () => {
  it("returns ok", async () => {
    expect(await health()).toEqual({ status: "ok" });
  });
});

describe("companiesCount", () => {
  it("totals match active + churned", async () => {
    const res = await companiesCount();
    expect(res.total_companies).toBe(1000);
    expect(res.active_companies + res.churned_companies).toBe(res.total_companies);
    expect(res.churned_companies).toBeGreaterThan(0);
  });
});

describe("listCompanies", () => {
  it("paginates results", async () => {
    const res = await listCompanies({ page: 1, pageSize: 10 });
    expect(res.companies).toHaveLength(10);
    expect(res.total).toBe(1000);
  });

  it("filters by planTier", async () => {
    const res = await listCompanies({ planTier: "enterprise", pageSize: 100 });
    expect(res.companies.every((c) => c.plan_tier === "enterprise")).toBe(true);
    expect(res.companies.length).toBeGreaterThan(0);
  });
});

describe("metricsOverview", () => {
  it("returns non-zero totals", async () => {
    const res = await metricsOverview();
    expect(res.total_companies).toBe(1000);
    expect(res.total_users).toBeGreaterThan(0);
    expect(res.total_events).toBe(100000);
    expect(res.current_mrr).toBeGreaterThan(0);
  });
});
