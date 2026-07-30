import { describe, it, expect } from "vitest";
import { computeCohortRetention } from "./cohortRetention";
import type { ProductEventRow, UserRow } from "./types";

describe("computeCohortRetention", () => {
  it("groups users by signup month and computes % still active in each subsequent month", () => {
    const now = new Date(2026, 2, 15); // March 2026
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: new Date(2026, 0, 1), created_at: new Date(2026, 0, 5) }, // Jan cohort
      { id: "USR-002", company_id: "CMP-001", first_login_at: new Date(2026, 0, 1), created_at: new Date(2026, 0, 10) }, // Jan cohort
    ];
    const events: ProductEventRow[] = [
      // USR-001 active in Jan, Feb, and March (months 0, 1, 2 since signup)
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 0, 6) },
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 1, 6) },
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 2, 6) },
      // USR-002 active only in Jan (month 0), never returns
      { user_id: "USR-002", feature_name: null, timestamp: new Date(2026, 0, 11) },
    ];

    const cells = computeCohortRetention(users, events, now, 3);
    const janCells = cells.filter((c) => c.cohort_month === "2026-01");
    const byOffset = Object.fromEntries(janCells.map((c) => [c.months_since_signup, c.retention_pct]));

    expect(byOffset[0]).toBeCloseTo(100, 5); // both active in signup month
    expect(byOffset[1]).toBeCloseTo(50, 5); // only USR-001 active month 1
    expect(byOffset[2]).toBeCloseTo(50, 5); // only USR-001 active month 2 -- if retention chained off the
    // previous month's survivors (compounding) instead of the original cohort size, this would read 100
    // (1 of 1 remaining survivor), not 50 (1 of 2 original members). This assertion catches that bug.
  });

  it("produces triangular data — a recent cohort has fewer observed offsets than an old one", () => {
    const now = new Date(2026, 2, 15); // March 2026
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 2, 1) }, // March cohort, signed up this month
    ];
    const cells = computeCohortRetention(users, [], now, 3);
    const marCells = cells.filter((c) => c.cohort_month === "2026-03");

    expect(marCells.map((c) => c.months_since_signup)).toEqual([0]); // only offset 0 is observable so far
    // If the implementation used a fixed range (e.g. 0..cohortMonths-1 = 0..2 for every cohort)
    // instead of bounding by monthsBetween(cohortMonth, now), this would wrongly equal [0, 1, 2].
  });

  it("bounds a mid-aged cohort's offsets exactly by months elapsed, not by a fixed constant", () => {
    // now is March 2026, cohortMonths=3 requests Jan/Feb/Mar as candidate cohorts.
    // The Feb cohort has exactly 1 month elapsed (Feb -> Mar), so it must produce
    // exactly offsets [0, 1] -- not 0 (too few, an off-by-one) and not [0,1,2] (a fixed constant bug).
    const now = new Date(2026, 2, 15); // March 2026
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 1, 10) }, // Feb cohort
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 1, 12) },
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 2, 3) },
    ];
    const cells = computeCohortRetention(users, events, now, 3);
    const febCells = cells.filter((c) => c.cohort_month === "2026-02");

    expect(febCells.map((c) => c.months_since_signup)).toEqual([0, 1]);
  });

  it("computes each month's retention independently against original cohort size, not against a continuously-active subset", () => {
    // Two users sign up in Jan. USR-001 is active in Jan and March but skips Feb entirely.
    // USR-002 is active only in Jan. If the implementation required continuous activity
    // (dropping a user from the "denominator pool" the first month they go quiet), then
    // USR-001's March appearance would either be ignored or miscounted. The correct behavior
    // treats each target month as an independent "at least one event that month" check against
    // the fixed original cohort size of 2.
    const now = new Date(2026, 2, 15); // March 2026
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: new Date(2026, 0, 1), created_at: new Date(2026, 0, 3) },
      { id: "USR-002", company_id: "CMP-001", first_login_at: new Date(2026, 0, 1), created_at: new Date(2026, 0, 7) },
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 0, 5) }, // Jan (month 0)
      // USR-001 has no Feb event (month 1) -- skips a month
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 2, 8) }, // March (month 2) -- returns
      { user_id: "USR-002", feature_name: null, timestamp: new Date(2026, 0, 20) }, // Jan (month 0) only
    ];
    const cells = computeCohortRetention(users, events, now, 3);
    const janCells = cells.filter((c) => c.cohort_month === "2026-01");
    const byOffset = Object.fromEntries(janCells.map((c) => [c.months_since_signup, c.retention_pct]));

    expect(byOffset[0]).toBeCloseTo(100, 5); // both active in Jan
    expect(byOffset[1]).toBeCloseTo(0, 5); // neither active in Feb
    expect(byOffset[2]).toBeCloseTo(50, 5); // only USR-001 active in March, against the original cohort of 2
  });

  it("keeps cohorts separate — a later cohort's users don't leak into an earlier cohort's counts", () => {
    const now = new Date(2026, 2, 15); // March 2026
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: new Date(2026, 0, 1), created_at: new Date(2026, 0, 5) }, // Jan cohort
      { id: "USR-002", company_id: "CMP-001", first_login_at: new Date(2026, 1, 1), created_at: new Date(2026, 1, 5) }, // Feb cohort
    ];
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 0, 6) },
      { user_id: "USR-002", feature_name: null, timestamp: new Date(2026, 1, 6) },
    ];
    const cells = computeCohortRetention(users, events, now, 3);
    const janOffset0 = cells.find((c) => c.cohort_month === "2026-01" && c.months_since_signup === 0);
    const febOffset0 = cells.find((c) => c.cohort_month === "2026-02" && c.months_since_signup === 0);

    // If USR-002 were incorrectly folded into the Jan cohort's denominator, Jan's offset-0
    // retention would read 100 (both active in their respective signup months relative to a
    // shared pool) -- but each cohort's denominator must be its own size (1 user each).
    expect(janOffset0?.retention_pct).toBeCloseTo(100, 5);
    expect(febOffset0?.retention_pct).toBeCloseTo(100, 5);
    expect(cells.filter((c) => c.cohort_month === "2026-01")).toHaveLength(3); // Jan -> offsets 0,1,2
    expect(cells.filter((c) => c.cohort_month === "2026-02")).toHaveLength(2); // Feb -> offsets 0,1
  });

  it("omits cohort months with zero signups entirely", () => {
    const now = new Date(2026, 2, 15);
    const cells = computeCohortRetention([], [], now, 3);
    expect(cells).toEqual([]);
  });
});
