import { describe, it, expect } from "vitest";
import { computeChurnRate } from "./churnRate";
import type { CompanyRow, SubscriptionRow } from "./types";

describe("computeChurnRate", () => {
  it("divides companies that churned this month by companies active at month start", () => {
    const now = new Date(2026, 6, 15); // July
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-01-01" },
      { id: "CMP-0002", signup_date: "2026-01-01" },
      { id: "CMP-0003", signup_date: "2026-01-01" },
      { id: "CMP-0004", signup_date: "2026-01-01" },
    ];
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 99, status: "canceled", start_date: "2026-01-01", end_date: "2026-07-10" },
      { company_id: "CMP-0002", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0003", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0004", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
    ];

    expect(computeChurnRate(companies, subscriptions, now)).toBeCloseTo(0.25, 5); // 1 of 4
  });

  it("returns 0 when nobody was active at month start", () => {
    expect(computeChurnRate([], [], new Date(2026, 6, 15))).toBe(0);
  });

  it("excludes a company from the denominator if it churned before month start", () => {
    const now = new Date(2026, 6, 15); // July
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-01-01" }, // churned in June, not active at July start
      { id: "CMP-0002", signup_date: "2026-01-01" }, // churns in July
      { id: "CMP-0003", signup_date: "2026-01-01" }, // stays active
    ];
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 99, status: "canceled", start_date: "2026-01-01", end_date: "2026-06-15" },
      { company_id: "CMP-0002", plan_name: "starter", mrr_amount: 99, status: "canceled", start_date: "2026-01-01", end_date: "2026-07-20" },
      { company_id: "CMP-0003", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
    ];

    // Only CMP-0002 and CMP-0003 are active at July's start (CMP-0001 already churned in June).
    // Of those 2, only CMP-0002 churns in July: 1/2 = 0.5
    expect(computeChurnRate(companies, subscriptions, now)).toBeCloseTo(0.5, 5);
  });

  it("excludes a mid-month signup from the month-start cohort denominator", () => {
    const now = new Date(2026, 6, 15); // July
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-01-01" }, // pre-existing, churns this month
      { id: "CMP-0002", signup_date: "2026-07-05" }, // signs up mid-month, stays active
    ];
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 99, status: "canceled", start_date: "2026-01-01", end_date: "2026-07-20" },
      { company_id: "CMP-0002", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-07-05", end_date: null },
    ];

    // Only CMP-0001 was active at month start (denominator = 1); CMP-0002 signed up
    // mid-month and must be excluded from the cohort entirely, regardless of its
    // status. Of the 1 company actually active at month start, it churned this
    // month: 1/1 = 1.
    //
    // If CMP-0002 were WRONGLY included in the denominator (a bug in the
    // signup-date exclusion), the denominator would be 2 while the numerator
    // stays 1 (CMP-0002 is active, not churned), giving 1/2 = 0.5 instead of the
    // correct 1 — so this assertion can distinguish correct exclusion from a bug
    // that fails to exclude it.
    expect(computeChurnRate(companies, subscriptions, now)).toBe(1);
  });
});
