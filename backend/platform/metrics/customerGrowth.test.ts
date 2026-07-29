import { describe, it, expect } from "vitest";
import { computeCustomerGrowth } from "./customerGrowth";
import type { CompanyRow, SubscriptionRow } from "./types";

describe("computeCustomerGrowth", () => {
  it("counts a company active from its signup month until it churns", () => {
    const companies: CompanyRow[] = [
      { id: "CMP-0001", signup_date: "2026-05-10" },
      { id: "CMP-0002", signup_date: "2026-06-01" },
    ];
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 99, status: "canceled", start_date: "2026-05-10", end_date: "2026-07-05" },
      { company_id: "CMP-0002", plan_name: "professional", mrr_amount: 499, status: "active", start_date: "2026-06-01", end_date: null },
    ];

    const growth = computeCustomerGrowth(companies, subscriptions, new Date(2026, 7, 1), 4);
    const byMonth = Object.fromEntries(growth.map((g) => [g.month, g.active_customers]));

    expect(byMonth["2026-05"]).toBe(1); // only CMP-0001 signed up
    expect(byMonth["2026-06"]).toBe(2); // both signed up, neither churned yet
    expect(byMonth["2026-07"]).toBe(1); // CMP-0001 already churned by the July cutoff (end_date 07-05 <= July's cutoff), only CMP-0002 remains
    expect(byMonth["2026-08"]).toBe(1); // CMP-0001 fully churned by August, only CMP-0002 remains
  });
});
