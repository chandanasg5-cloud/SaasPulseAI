import { describe, it, expect } from "vitest";
import { computeSeatPenetrationScore } from "./seatPenetrationScore";
import type { ProductEventRow, UserRow } from "./types";

describe("computeSeatPenetrationScore", () => {
  const now = new Date(2026, 6, 30);

  function makeActiveUsers(count: number): { users: UserRow[]; events: ProductEventRow[] } {
    const users: UserRow[] = Array.from({ length: count }, (_, i) => ({
      id: `USR-${i}`,
      company_id: "CMP-001",
      first_login_at: null,
      created_at: new Date(2026, 0, 1),
    }));
    const events: ProductEventRow[] = users.map((u) => ({
      user_id: u.id,
      feature_name: null,
      timestamp: new Date(2026, 6, 25),
    }));
    return { users, events };
  }

  it("scores (active users / company size) * 25", () => {
    const { users, events } = makeActiveUsers(10);
    // 10 active users / company_size 50 -> (10/50)*25 = 5
    expect(computeSeatPenetrationScore(users, events, 50, now)).toBeCloseTo(5, 5);
  });

  it("clamps to 25 when active users exceed company size", () => {
    const { users, events } = makeActiveUsers(10);
    // 10 active users / company_size 4 -> (10/4)*25 = 62.5, clamped to 25
    expect(computeSeatPenetrationScore(users, events, 4, now)).toBe(25);
  });

  it("returns 0 when company_size is 0", () => {
    expect(computeSeatPenetrationScore([], [], 0, now)).toBe(0);
  });

  it("ignores events outside the trailing 30-day window", () => {
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 0, 1) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 3, 1) },
    ];
    expect(computeSeatPenetrationScore(users, events, 10, now)).toBe(0);
  });
});
