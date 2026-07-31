import { describe, it, expect } from "vitest";
import { health, companiesCount, listCompanies, executiveOverview, productOverview } from "./api";
import { customerHealthScores } from "./api";
import { db } from "./db";

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

describe("executiveOverview", () => {
  it("returns all 8 KPIs and all 4 chart datasets from real seeded data", async () => {
    const res = await executiveOverview();

    expect(res.kpis.mrr).toBeGreaterThan(0);
    expect(res.kpis.arr).toBeCloseTo(res.kpis.mrr * 12, 2);
    expect(res.kpis.customer_count).toBeGreaterThan(0);
    expect(typeof res.kpis.revenue_growth_pct).toBe("number");
    expect(typeof res.kpis.cac).toBe("number");
    expect(typeof res.kpis.clv).toBe("number");
    expect(typeof res.kpis.churn_rate_pct).toBe("number");
    expect(typeof res.kpis.nrr_pct).toBe("number");

    expect(res.charts.revenue_trend).toHaveLength(12);
    expect(res.charts.customer_growth).toHaveLength(12);
    expect(res.charts.subscription_breakdown.length).toBeGreaterThan(0);
    expect(res.charts.mrr_waterfall.ending_mrr).toBeCloseTo(
      res.charts.mrr_waterfall.starting_mrr +
        res.charts.mrr_waterfall.new_mrr +
        res.charts.mrr_waterfall.expansion_mrr +
        res.charts.mrr_waterfall.contraction_mrr +
        res.charts.mrr_waterfall.churned_mrr,
      2,
    );
  });
});

describe("productOverview", () => {
  it("returns all 5 KPIs, the 5-stage funnel, and all 3 chart datasets from real seeded data", async () => {
    const res = await productOverview();

    expect(res.kpis.dau).toBeGreaterThanOrEqual(0);
    expect(res.kpis.wau).toBeGreaterThanOrEqual(res.kpis.dau);
    expect(res.kpis.mau).toBeGreaterThanOrEqual(res.kpis.wau);
    expect(typeof res.kpis.stickiness_pct).toBe("number");
    expect(typeof res.kpis.feature_adoption_pct).toBe("number");

    expect(res.funnel).toHaveLength(5);
    expect(res.funnel.map((f) => f.stage)).toEqual([
      "signup", "first_login", "first_feature_usage", "product_adoption", "paid_conversion",
    ]);
    // Each stage's count should never exceed the previous stage's (funnel narrows or holds, never widens)
    for (let i = 1; i < res.funnel.length; i++) {
      expect(res.funnel[i].count).toBeLessThanOrEqual(res.funnel[i - 1].count);
    }

    expect(res.charts.feature_usage_ranking.length).toBeGreaterThan(0);
    expect(res.charts.engagement_trend).toHaveLength(30);
    expect(res.charts.cohort_retention.length).toBeGreaterThan(0);
  });
});

describe("customerHealthScores", () => {
  it("returns paginated, real-computed health scores for active companies only", async () => {
    const res = await customerHealthScores({ page: 1, pageSize: 10 });

    expect(res.customers).toHaveLength(10);
    expect(res.total).toBeGreaterThan(0);

    for (const c of res.customers) {
      expect(c.overall_score).toBeCloseTo(
        c.usage_score + c.adoption_score + c.support_score + c.revenue_score,
        5,
      );
      expect(["low", "medium", "high"]).toContain(c.risk_level);
      expect(typeof c.recommended_action).toBe("string");
      expect(c.recommended_action.length).toBeGreaterThan(0);
    }
  });

  it("excludes churned companies", async () => {
    const res = await customerHealthScores({ page: 1, pageSize: 100 });
    const churnedRow = await db.queryRow`
      SELECT c.id FROM companies c
      JOIN subscriptions s ON s.company_id = c.id
      WHERE s.status = 'canceled' AND s.end_date <= CURRENT_DATE
      LIMIT 1
    `;
    if (churnedRow) {
      expect(res.customers.some((c) => c.company_id === churnedRow.id)).toBe(false);
    }
  });
});
