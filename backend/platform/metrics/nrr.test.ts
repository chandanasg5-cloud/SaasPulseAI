import { describe, it, expect } from "vitest";
import { computeNrr } from "./nrr";
import type { CompanyRow, SubscriptionEventRow } from "./types";

describe("computeNrr", () => {
  it("excludes new-customer MRR from the same month, includes expansion/contraction/churn for existing customers", () => {
    const now = new Date(2026, 6, 15); // July
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-01-01" }, // existing before July
      { id: "CMP-0002", signup_date: "2026-07-05" }, // new this month
    ];
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-01-01", event_type: "new_subscription", mrr_change: 1000 },
      { company_id: "CMP-0001", event_date: "2026-07-10", event_type: "upgrade", mrr_change: 200 },
      { company_id: "CMP-0002", event_date: "2026-07-05", event_type: "new_subscription", mrr_change: 500 },
    ];

    // starting MRR = 1000 (only CMP-0001, before July). CMP-0002's new_subscription
    // is excluded even though it falls in July, because NRR only tracks the existing cohort.
    expect(computeNrr(companies, events, now)).toBeCloseTo((1000 + 200) / 1000, 5);
  });

  it("returns 0 when there is no existing-cohort starting MRR", () => {
    const now = new Date(2026, 6, 15);
    expect(computeNrr([], [], now)).toBe(0);
  });

  it("includes contraction and churn (negative mrr_change) for existing customers", () => {
    const now = new Date(2026, 6, 15); // July
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-01-01" },
      { id: "CMP-0002", signup_date: "2026-01-01" },
    ];
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-01-01", event_type: "new_subscription", mrr_change: 1000 },
      { company_id: "CMP-0002", event_date: "2026-01-01", event_type: "new_subscription", mrr_change: 500 },
      { company_id: "CMP-0001", event_date: "2026-07-12", event_type: "downgrade", mrr_change: -100 },
      { company_id: "CMP-0002", event_date: "2026-07-18", event_type: "cancellation", mrr_change: -500 },
    ];

    // starting MRR = 1500. Net change this month = -100 + -500 = -600.
    // (1500 - 600) / 1500 = 0.6
    expect(computeNrr(companies, events, now)).toBeCloseTo(900 / 1500, 5);
  });

  it("excludes a non-cohort company's event from netChangeThisMonth even with nonzero starting MRR", () => {
    const now = new Date(2026, 6, 15); // July
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-01-01" }, // existing cohort, well before July
      { id: "CMP-0002", signup_date: "2026-07-10" }, // signs up this month, NOT in cohort
    ];
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-01-01", event_type: "new_subscription", mrr_change: 1000 },
      { company_id: "CMP-0002", event_date: "2026-07-15", event_type: "upgrade", mrr_change: 300 },
    ];

    // startingMrr = 1000 (from CMP-0001's pre-July new_subscription event) — nonzero,
    // so the startingMrr === 0 early return is never hit, meaning netChangeThisMonth's
    // cohort filter is genuinely exercised by this test.
    //
    // CMP-0002's +300 upgrade event falls within July, but CMP-0002 is NOT part of the
    // existing cohort (it signed up this month), so it must be excluded from
    // netChangeThisMonth entirely: result should be exactly 1000 / 1000 = 1.
    //
    // If the cohort filter on netChangeThisMonth were ever broken/removed, CMP-0002's
    // +300 would leak in, giving (1000 + 300) / 1000 = 1.3 instead — so this assertion
    // can distinguish a correctly-filtered netChangeThisMonth from a broken one.
    expect(computeNrr(companies, events, now)).toBe(1);
  });
});
