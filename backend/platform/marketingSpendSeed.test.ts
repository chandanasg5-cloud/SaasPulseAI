import { describe, it, expect } from "vitest";
import { ensureMarketingSpendSeeded, doSeedMarketingSpend } from "./marketingSpendSeed";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("ensureMarketingSpendSeeded", () => {
  it("populates marketing_spend correlated with real new-paying-customer counts", async () => {
    await ensureSeeded(); // Phase 1 dataset must exist first
    await ensureMarketingSpendSeeded();

    const countRow = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;
    expect(countRow?.n).toBeGreaterThan(0);

    const monthsWithNewCustomers = await db.queryRow`
      SELECT COUNT(DISTINCT date_trunc('month', event_date))::int AS n
      FROM subscription_events
      WHERE event_type = 'new_subscription' AND mrr_change > 0
    `;
    expect(countRow?.n).toBe(monthsWithNewCustomers?.n);
  });

  it("is idempotent — a second call does not duplicate rows", async () => {
    await ensureMarketingSpendSeeded();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;
    await ensureMarketingSpendSeeded();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;
    expect(after?.n).toBe(before?.n);
  });

  it("doSeedMarketingSpend's DB-level guard prevents reseeding when called directly a second time", async () => {
    // ensureMarketingSpendSeeded() memoizes its promise in-process, so calling
    // it twice never re-runs doSeedMarketingSpend()'s body — it can't prove
    // the DB-level `existing.n > 0` guard actually works. Calling
    // doSeedMarketingSpend() directly here bypasses that in-process cache
    // entirely and re-executes the function's body, including the guard,
    // against an already-seeded database.
    await ensureMarketingSpendSeeded();

    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;
    await doSeedMarketingSpend();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;

    expect(after?.n).toBe(before?.n);
  });
});
