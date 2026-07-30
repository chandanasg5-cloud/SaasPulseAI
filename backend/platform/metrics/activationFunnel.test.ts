import { describe, it, expect } from "vitest";
import { computeActivationFunnel } from "./activationFunnel";
import type { ProductEventRow, UserRow } from "./types";

describe("computeActivationFunnel", () => {
  it("computes a monotonically non-increasing count through all 5 stages", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: new Date(2026, 0, 2), created_at: new Date(2026, 0, 1) },
      { id: "USR-002", company_id: "CMP-002", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 0, 2) },
      { user_id: "USR-001", feature_name: "reports", timestamp: new Date(2026, 0, 3) },
      { user_id: "USR-001", feature_name: "api", timestamp: new Date(2026, 0, 4) },
    ];
    const paidCompanyIds = new Set(["CMP-001"]);

    const funnel = computeActivationFunnel(users, events, paidCompanyIds);
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

    expect(byStage.signup).toBe(2);
    expect(byStage.first_login).toBe(1); // only USR-001 logged in
    expect(byStage.first_feature_usage).toBe(1); // only USR-001 used any feature
    expect(byStage.product_adoption).toBe(1); // USR-001 used 3 distinct features
    expect(byStage.paid_conversion).toBe(1); // only CMP-001 is paid
  });

  it("requires 3+ DISTINCT features for product_adoption, not just 3+ events", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: new Date(2026, 0, 2), created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 0, 2) },
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 0, 3) },
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 0, 4) },
    ];
    const funnel = computeActivationFunnel(users, events, new Set());
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

    expect(byStage.first_feature_usage).toBe(1);
    expect(byStage.product_adoption).toBe(0); // only 1 distinct feature, not 3
  });

  it("returns stages in order: signup, first_login, first_feature_usage, product_adoption, paid_conversion", () => {
    const funnel = computeActivationFunnel([], [], new Set());
    expect(funnel.map((f) => f.stage)).toEqual([
      "signup", "first_login", "first_feature_usage", "product_adoption", "paid_conversion",
    ]);
  });

  it("does NOT count a user toward first_feature_usage/product_adoption if they never logged in, even with 3+ distinct feature events (cascading gate, not independent predicate)", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 0, 2) },
      { user_id: "USR-001", feature_name: "reports", timestamp: new Date(2026, 0, 3) },
      { user_id: "USR-001", feature_name: "api", timestamp: new Date(2026, 0, 4) },
    ];
    const paidCompanyIds = new Set(["CMP-001"]);

    const funnel = computeActivationFunnel(users, events, paidCompanyIds);
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

    expect(byStage.signup).toBe(1);
    expect(byStage.first_login).toBe(0); // never logged in
    expect(byStage.first_feature_usage).toBe(0); // gated on first_login, despite 3 distinct feature events
    expect(byStage.product_adoption).toBe(0); // gated on first_feature_usage
  });
});
