import { describe, it, expect } from "vitest";
import {
  formatExecutiveOverview, formatProductOverview, formatCustomerSegments,
  formatChurnRisks, formatCompanyProfile,
} from "./chatFormat";

describe("formatExecutiveOverview", () => {
  it("includes MRR, ARR, growth, customer count, churn, and NRR", () => {
    const text = formatExecutiveOverview({
      kpis: {
        mrr: 50000, arr: 600000, revenue_growth_pct: 5.2, customer_count: 774,
        cac: 120.5, clv: 2400.75, churn_rate_pct: 2.1, nrr_pct: 108.3,
      },
    });
    expect(text).toContain("$50000.00");
    expect(text).toContain("$600000.00");
    expect(text).toContain("5.2%");
    expect(text).toContain("774");
    expect(text).toContain("2.1%");
    expect(text).toContain("108.3%");
  });
});

describe("formatProductOverview", () => {
  it("includes DAU/WAU/MAU and the funnel stages", () => {
    const text = formatProductOverview({
      kpis: { dau: 100, wau: 400, mau: 900, stickiness_pct: 11.1, feature_adoption_pct: 42.5 },
      funnel: [
        { stage: "signup", count: 1000 },
        { stage: "first_login", count: 800 },
      ],
    });
    expect(text).toContain("DAU: 100");
    expect(text).toContain("WAU: 400");
    expect(text).toContain("MAU: 900");
    expect(text).toContain("signup: 1000");
    expect(text).toContain("first_login: 800");
  });
});

describe("formatCustomerSegments", () => {
  it("includes each segment's label and count", () => {
    const text = formatCustomerSegments({
      segments: [
        { segment_label: "Power Users", company_count: 100, pct_of_total: 25,
          avg_usage_score: 20, avg_adoption_score: 19, avg_support_score: 18,
          avg_revenue_score: 21, avg_seat_penetration_score: 20 },
      ],
    });
    expect(text).toContain("Power Users: 100 companies (25.0%)");
  });
});

describe("formatChurnRisks", () => {
  it("lists companies with probability, risk level, and drivers", () => {
    const text = formatChurnRisks({
      companies: [
        { company_name: "Acme Corp", churn_probability: 0.62, risk_level: "high",
          primary_risk_driver: "Short Tenure", secondary_risk_driver: "Weak Feature Adoption",
          recommendation: "Urgent: schedule a call" },
      ],
      total: 774,
    });
    expect(text).toContain("Acme Corp: 62% churn probability (high risk)");
    expect(text).toContain("Short Tenure, Weak Feature Adoption");
    expect(text).toContain("of 774 total");
  });

  it("returns a clear message for an empty list", () => {
    expect(formatChurnRisks({ companies: [], total: 0 })).toBe("No companies with churn predictions found.");
  });
});

describe("formatCompanyProfile", () => {
  it("returns a not-found message when found is false", () => {
    expect(formatCompanyProfile({ found: false })).toBe("No company found matching that name.");
  });

  it("formats a full profile including churn data", () => {
    const text = formatCompanyProfile({
      found: true,
      company: {
        name: "Acme Corp", industry: "Software", plan_tier: "enterprise",
        health: { overall_score: 78, risk_level: "low", recommended_action: "Maintain touchpoints" },
        segment_label: "Power Users",
        churn: { probability: 0.08, risk_level: "low", primary_risk_driver: "Low Support Burden",
          secondary_risk_driver: "High Plan Value", recommendation: "Monitor for renewal risk" },
      },
    });
    expect(text).toContain("Acme Corp (Software, enterprise plan)");
    expect(text).toContain("78/100 (low risk)");
    expect(text).toContain("Segment: Power Users");
    expect(text).toContain("8% (low)");
  });

  it("notes churn/segment as unavailable for a company with neither", () => {
    const text = formatCompanyProfile({
      found: true,
      company: {
        name: "Old Co", industry: "Retail", plan_tier: "free",
        health: { overall_score: 30, risk_level: "high", recommended_action: "..." },
        segment_label: null,
        churn: null,
      },
    });
    expect(text).toContain("not available");
  });
});
