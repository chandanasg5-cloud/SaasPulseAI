import { describe, it, expect } from "vitest";
import { ensureSeeded, doSeed } from "./seed";
import { db } from "./db";

describe("ensureSeeded", () => {
  it("populates all raw tables at target volumes", async () => {
    await ensureSeeded();

    const companies = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    expect(companies?.n).toBe(1000);

    const users = await db.queryRow`SELECT COUNT(*)::int AS n FROM users`;
    expect(users?.n).toBeGreaterThan(0);

    const events = await db.queryRow`SELECT COUNT(*)::int AS n FROM product_events`;
    expect(events?.n).toBe(100000);

    const subs = await db.queryRow`SELECT COUNT(*)::int AS n FROM subscriptions`;
    expect(subs?.n).toBe(1000);

    const subEvents = await db.queryRow`SELECT COUNT(*)::int AS n FROM subscription_events`;
    expect(subEvents?.n).toBeGreaterThan(0);

    const churned = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies WHERE customer_stage = 'churned'`;
    expect(churned?.n).toBeGreaterThan(0);

    // Hidden generation variables must never reach the schema.
    const companyColumns = db.query<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'
    `;
    const names = new Set<string>();
    for await (const c of companyColumns) names.add(c.column_name);
    expect(names.has("health_factor")).toBe(false);
    expect(names.has("true_churn_probability")).toBe(false);
  });

  it("is idempotent — a second call does not duplicate rows", async () => {
    await ensureSeeded();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    await ensureSeeded();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    expect(after?.n).toBe(before?.n);
  });

  it("doSeed's DB-level guard prevents reseeding when called directly a second time", async () => {
    // ensureSeeded() memoizes its promise in-process, so calling it twice
    // never re-runs doSeed()'s body — it can't prove the DB-level
    // `existing.n > 0` guard actually works. Calling doSeed() directly here
    // bypasses that in-process cache entirely and re-executes the function's
    // body, including the guard, against an already-seeded database.
    await ensureSeeded();

    const companiesBefore = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    const eventsBefore = await db.queryRow`SELECT COUNT(*)::int AS n FROM product_events`;

    await doSeed();

    const companiesAfter = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    const eventsAfter = await db.queryRow`SELECT COUNT(*)::int AS n FROM product_events`;

    expect(companiesAfter?.n).toBe(companiesBefore?.n);
    expect(eventsAfter?.n).toBe(eventsBefore?.n);
  });
});
