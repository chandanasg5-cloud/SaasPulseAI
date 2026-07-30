import { describe, it, expect } from "vitest";
import { computeUsageScore } from "./usageScore";
import type { ProductEventRow, UserRow } from "./types";

describe("computeUsageScore", () => {
  const now = new Date(2026, 6, 30);

  it("scores (active users / total users) * 25", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
      { id: "USR-002", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
      { id: "USR-003", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
      { id: "USR-004", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 6, 25) }, // active, in window
    ];
    // 1 of 4 users active in the trailing 30 days -> (1/4)*25 = 6.25
    expect(computeUsageScore(users, events, now)).toBeCloseTo(6.25, 5);
  });

  it("ignores events outside the trailing 30-day window", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 3, 1) }, // ~90 days before now, outside window
    ];
    expect(computeUsageScore(users, events, now)).toBe(0);
  });

  it("returns 0 when the company has no users", () => {
    expect(computeUsageScore([], [], now)).toBe(0);
  });
});
