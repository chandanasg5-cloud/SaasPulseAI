import { describe, it, expect } from "vitest";
import { countActiveUsers } from "./activeUsers";
import type { ProductEventRow, UserRow } from "./types";

describe("countActiveUsers", () => {
  const now = new Date(2026, 6, 30);

  it("counts users with at least one event in the trailing 30 days", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
      { id: "USR-002", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 6, 25) },
    ];
    expect(countActiveUsers(users, events, now)).toBe(1);
  });

  it("ignores events outside the trailing 30-day window", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 3, 1) },
    ];
    expect(countActiveUsers(users, events, now)).toBe(0);
  });

  it("returns 0 for an empty user list", () => {
    expect(countActiveUsers([], [], now)).toBe(0);
  });
});
