# SaaSPulse AI — Phase 2 Executive Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's placeholder `/dashboard` KPI row with 8 real Executive Command Center KPIs and 4 charts, computed from Phase 1's seeded data plus a new marketing_spend table (needed only for CAC).

**Architecture:** A new migration adds `marketing_spend`, seeded independently against the already-committed dataset. Eight pure TypeScript metric functions (`backend/platform/metrics/*.ts`) compute KPIs/chart data from raw rows fetched by one consolidated `GET /metrics/executive-overview` endpoint, which replaces Phase 1's `GET /metrics/overview`. The frontend adds Recharts and four chart components, each following the dataviz skill's form/color rules (avoiding the MRR/ARR dual-axis trap by making ARR a derived KPI tile, not a second trend line).

**Tech Stack:** Encore.ts (unchanged), Recharts `^2.15.0` (new), same shadcn/ui components as Phase 1.

## Global Constraints

- All financial metrics are event-sourced off `subscription_events` (`mrr_change`), never re-derived from `subscriptions` snapshots alone.
- CAC and revenue-growth-relevant new-customer counts exclude free-tier signups (`mrr_change > 0` filter) — standard SaaS practice, not a simplification.
- NRR cohort = companies that existed before the current month started; new-customer MRR from the current month is excluded from the NRR calculation.
- Currency is GBP (£) everywhere displayed. Percentages (`revenue_growth_pct`, `churn_rate_pct`, `nrr_pct`) are returned as already-multiplied-by-100 numbers (e.g. `12.5` means 12.5%, not `0.125`).
- Metric functions in `backend/platform/metrics/` take already-fetched raw rows and never touch `db`/`encore.dev` directly — this is what keeps them unit-testable without Postgres and reusable by the future AI Analyst Copilot (Phase 7).
- Never plot MRR and ARR as two lines/series on the same chart (would require two y-axes — the dual-axis anti-pattern). ARR is a KPI stat tile only, derived as `mrr * 12`.
- Chart colors come from the dataviz skill's validated reference palette (`references/palette.md`), added to `frontend/app/globals.css` as CSS custom properties, referenced via `var(--series-1)` etc. in Recharts props — never hardcoded hex inline in a chart component, and never picked by eye.
- Test command for backend: `encore test <path>` (not plain `npx vitest run`) — any file importing `encore.dev` needs Encore's runtime injection. Metric-function tests (pure, no `encore.dev` import) can use either, but use `encore test` throughout for consistency with the rest of the project.
- Frontend verification: `npx tsc --noEmit`, not a long-running local `next dev`/`next build`.

---

### Task 1: marketing_spend migration

**Files:**
- Create: `backend/platform/migrations/2_marketing_spend.up.sql`
- Test: `backend/platform/schema.test.ts` (extend the existing file from Phase 1)

**Interfaces:**
- Produces: a `marketing_spend` table (`id`, `month DATE`, `amount NUMERIC(10,2)`) — consumed by Task 8's seeding wiring and Task 9's endpoint.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("schema", ...)` block in `backend/platform/schema.test.ts`:

```ts
it("has the marketing_spend table", async () => {
  const rows = db.query<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'marketing_spend'
  `;
  const names: string[] = [];
  for await (const r of rows) names.push(r.table_name);
  expect(names).toContain("marketing_spend");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/schema.test.ts`
Expected: FAIL — the new test's assertion is empty (table doesn't exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- backend/platform/migrations/2_marketing_spend.up.sql
CREATE TABLE marketing_spend (
    id     TEXT PRIMARY KEY,
    month  DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL
);
CREATE INDEX marketing_spend_month_idx ON marketing_spend(month);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/schema.test.ts`
Expected: PASS (2/2 — the original 8-table test plus this new one)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/migrations/2_marketing_spend.up.sql backend/platform/schema.test.ts
git commit -m "feat(backend): add marketing_spend table migration"
```

---

### Task 2: Month utility functions

**Files:**
- Create: `backend/platform/metrics/months.ts`
- Test: `backend/platform/metrics/months.test.ts`

**Interfaces:**
- Produces: `monthKey(date: Date): string` (e.g. `"2026-07"`), `startOfMonth(date: Date): Date`, `endOfMonth(date: Date): Date`, `trailingMonths(now: Date, count: number): Date[]` (oldest to newest, each the 1st of its month) — consumed by every metric function in Tasks 4-7.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/months.test.ts
import { describe, it, expect } from "vitest";
import { monthKey, startOfMonth, endOfMonth, trailingMonths } from "./months";

describe("monthKey", () => {
  it("formats as YYYY-MM", () => {
    expect(monthKey(new Date(2026, 6, 15))).toBe("2026-07");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("returns the first and last instant of the month", () => {
    const start = startOfMonth(new Date(2026, 6, 15));
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(6);

    const end = endOfMonth(new Date(2026, 6, 15));
    expect(end.getMonth()).toBe(6);
    expect(end.getDate()).toBe(31);
  });
});

describe("trailingMonths", () => {
  it("returns count months, oldest first, ending at now's month", () => {
    const months = trailingMonths(new Date(2026, 6, 27), 3);
    expect(months).toHaveLength(3);
    expect(monthKey(months[0])).toBe("2026-05");
    expect(monthKey(months[1])).toBe("2026-06");
    expect(monthKey(months[2])).toBe("2026-07");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/months.test.ts`
Expected: FAIL — `./months` module not found.

- [ ] **Step 3: Write the utilities**

```ts
// backend/platform/metrics/months.ts
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function trailingMonths(now: Date, count: number): Date[] {
  const months: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/months.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/months.ts backend/platform/metrics/months.test.ts
git commit -m "feat(backend): add month utility functions for metrics layer"
```

---

### Task 3: Shared metrics row types + marketing spend generator

**Files:**
- Create: `backend/platform/metrics/types.ts`
- Create: `backend/platform/generate/marketingSpend.ts`
- Test: `backend/platform/generate/marketingSpend.test.ts`

**Interfaces:**
- Produces: `CompanyRow` (`id`, `signup_date`), `SubscriptionRow` (`company_id`, `plan_name`, `mrr_amount`, `status`, `start_date`, `end_date`), `SubscriptionEventRow` (`company_id`, `event_date`, `event_type`, `mrr_change`), `MarketingSpendRow` (`month`, `amount`) — all snake_case, matching this project's existing DB-row-to-API convention (see `backend/platform/api.ts`'s `CompanySummary`). Consumed by every metric function (Tasks 4-7) and the endpoint (Task 9).
- Produces: `generateMarketingSpend(newPayingCustomersByMonth: {month: string; count: number}[], seed: number): {id: string; month: string; amount: number}[]` — consumed by Task 8's seeding wiring.

- [ ] **Step 1: Write the shared types**

```ts
// backend/platform/metrics/types.ts
export interface CompanyRow {
  id: string;
  signup_date: string;
}

export interface SubscriptionRow {
  company_id: string;
  plan_name: string;
  mrr_amount: number;
  status: "active" | "canceled" | "trialing" | "past_due";
  start_date: string;
  end_date: string | null;
}

export type SubscriptionEventType = "new_subscription" | "upgrade" | "downgrade" | "cancellation" | "renewal";

export interface SubscriptionEventRow {
  company_id: string;
  event_date: string;
  event_type: SubscriptionEventType;
  mrr_change: number;
}

export interface MarketingSpendRow {
  month: string;
  amount: number;
}
```

- [ ] **Step 2: Write the failing test for the generator**

```ts
// backend/platform/generate/marketingSpend.test.ts
import { describe, it, expect } from "vitest";
import { generateMarketingSpend } from "./marketingSpend";

describe("generateMarketingSpend", () => {
  it("generates one row per input month, in order", () => {
    const rows = generateMarketingSpend(
      [
        { month: "2026-01-01", count: 10 },
        { month: "2026-02-01", count: 20 },
      ],
      1,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe("2026-01-01");
    expect(rows[1].month).toBe("2026-02-01");
  });

  it("scales spend with new-customer count, staying in a plausible CAC band", () => {
    const rows = generateMarketingSpend(
      [
        { month: "2026-01-01", count: 10 },
        { month: "2026-02-01", count: 100 },
      ],
      2,
    );
    const impliedCac = (row: { amount: number }, count: number) => row.amount / count;
    expect(impliedCac(rows[0], 10)).toBeGreaterThanOrEqual(150);
    expect(impliedCac(rows[0], 10)).toBeLessThanOrEqual(400);
    expect(impliedCac(rows[1], 100)).toBeGreaterThanOrEqual(150);
    expect(impliedCac(rows[1], 100)).toBeLessThanOrEqual(400);
  });

  it("returns zero spend for a zero-count month", () => {
    const rows = generateMarketingSpend([{ month: "2026-01-01", count: 0 }], 3);
    expect(rows[0].amount).toBe(0);
  });

  it("produces unique, sequential ids", () => {
    const rows = generateMarketingSpend(
      [
        { month: "2026-01-01", count: 5 },
        { month: "2026-02-01", count: 5 },
        { month: "2026-03-01", count: 5 },
      ],
      4,
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/generate/marketingSpend.test.ts`
Expected: FAIL — `./marketingSpend` module not found.

- [ ] **Step 4: Write the generator**

```ts
// backend/platform/generate/marketingSpend.ts
import { mulberry32 } from "./rng";

export interface MarketingSpendRow {
  id: string;
  month: string;
  amount: number;
}

export function generateMarketingSpend(
  newPayingCustomersByMonth: { month: string; count: number }[],
  seed: number,
): MarketingSpendRow[] {
  const rng = mulberry32(seed);

  return newPayingCustomersByMonth.map(({ month, count }, i) => {
    const perCustomerCac = 150 + rng() * 250; // £150–£400 plausible CAC band
    const amount = Math.round(count * perCustomerCac * 100) / 100;
    return {
      id: `MKT-${String(i + 1).padStart(4, "0")}`,
      month,
      amount,
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/generate/marketingSpend.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/types.ts backend/platform/generate/marketingSpend.ts backend/platform/generate/marketingSpend.test.ts
git commit -m "feat(backend): add shared metrics types and marketing spend generator"
```

---

### Task 4: MRR trend + MRR waterfall metric functions

**Files:**
- Create: `backend/platform/metrics/mrrTrend.ts`
- Create: `backend/platform/metrics/mrrWaterfall.ts`
- Test: `backend/platform/metrics/mrrTrend.test.ts`
- Test: `backend/platform/metrics/mrrWaterfall.test.ts`

**Interfaces:**
- Consumes: `SubscriptionEventRow` from Task 3; `trailingMonths`, `endOfMonth`, `startOfMonth`, `monthKey` from Task 2.
- Produces: `computeMrrTrend(events: SubscriptionEventRow[], now: Date, monthCount?: number): {month: string; mrr: number}[]`; `computeMrrWaterfall(events: SubscriptionEventRow[], now: Date): {starting_mrr, new_mrr, expansion_mrr, contraction_mrr, churned_mrr, ending_mrr}` — both consumed by Task 9's endpoint.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/platform/metrics/mrrTrend.test.ts
import { describe, it, expect } from "vitest";
import { computeMrrTrend } from "./mrrTrend";
import type { SubscriptionEventRow } from "./types";

describe("computeMrrTrend", () => {
  it("accumulates mrr_change up to each month's end", () => {
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-05-10", event_type: "new_subscription", mrr_change: 100 },
      { company_id: "CMP-0002", event_date: "2026-06-05", event_type: "new_subscription", mrr_change: 200 },
      { company_id: "CMP-0001", event_date: "2026-06-20", event_type: "upgrade", mrr_change: 50 },
    ];
    const trend = computeMrrTrend(events, new Date(2026, 6, 15), 3);

    expect(trend.map((p) => p.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(trend[0].mrr).toBe(100);
    expect(trend[1].mrr).toBe(350);
    expect(trend[2].mrr).toBe(350);
  });

  it("ignores events dated after the trend window", () => {
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-08-01", event_type: "new_subscription", mrr_change: 999 },
    ];
    const trend = computeMrrTrend(events, new Date(2026, 6, 15), 1);
    expect(trend[0].mrr).toBe(0);
  });
});
```

```ts
// backend/platform/metrics/mrrWaterfall.test.ts
import { describe, it, expect } from "vitest";
import { computeMrrWaterfall } from "./mrrWaterfall";
import type { SubscriptionEventRow } from "./types";

describe("computeMrrWaterfall", () => {
  it("splits the current month's events by type and sums a prior starting balance", () => {
    const now = new Date(2026, 6, 15); // July 2026
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-05-01", event_type: "new_subscription", mrr_change: 500 },
      { company_id: "CMP-0002", event_date: "2026-07-05", event_type: "new_subscription", mrr_change: 100 },
      { company_id: "CMP-0001", event_date: "2026-07-10", event_type: "upgrade", mrr_change: 50 },
      { company_id: "CMP-0003", event_date: "2026-06-01", event_type: "new_subscription", mrr_change: 200 },
      { company_id: "CMP-0003", event_date: "2026-07-12", event_type: "downgrade", mrr_change: -80 },
      { company_id: "CMP-0004", event_date: "2026-06-01", event_type: "new_subscription", mrr_change: 300 },
      { company_id: "CMP-0004", event_date: "2026-07-20", event_type: "cancellation", mrr_change: -300 },
    ];

    const waterfall = computeMrrWaterfall(events, now);

    expect(waterfall.starting_mrr).toBe(1000); // 500 + 200 + 300 (all before July)
    expect(waterfall.new_mrr).toBe(100);
    expect(waterfall.expansion_mrr).toBe(50);
    expect(waterfall.contraction_mrr).toBe(-80);
    expect(waterfall.churned_mrr).toBe(-300);
    expect(waterfall.ending_mrr).toBe(1000 + 100 + 50 - 80 - 300);
  });

  it("excludes renewal events from every bucket (mrr_change is always 0 for renewals)", () => {
    const now = new Date(2026, 6, 15);
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-07-05", event_type: "renewal", mrr_change: 0 },
    ];
    const waterfall = computeMrrWaterfall(events, now);
    expect(waterfall.new_mrr).toBe(0);
    expect(waterfall.expansion_mrr).toBe(0);
    expect(waterfall.contraction_mrr).toBe(0);
    expect(waterfall.churned_mrr).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/mrrTrend.test.ts platform/metrics/mrrWaterfall.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the functions**

```ts
// backend/platform/metrics/mrrTrend.ts
import type { SubscriptionEventRow } from "./types";
import { endOfMonth, monthKey, trailingMonths } from "./months";

export interface MrrTrendPoint {
  month: string;
  mrr: number;
}

export function computeMrrTrend(
  events: SubscriptionEventRow[],
  now: Date,
  monthCount = 12,
): MrrTrendPoint[] {
  const months = trailingMonths(now, monthCount);

  return months.map((monthStart) => {
    const cutoff = endOfMonth(monthStart);
    const mrr = events
      .filter((e) => new Date(e.event_date) <= cutoff)
      .reduce((sum, e) => sum + e.mrr_change, 0);
    return { month: monthKey(monthStart), mrr };
  });
}
```

```ts
// backend/platform/metrics/mrrWaterfall.ts
import type { SubscriptionEventRow } from "./types";
import { endOfMonth, startOfMonth } from "./months";

export interface MrrWaterfall {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

export function computeMrrWaterfall(events: SubscriptionEventRow[], now: Date): MrrWaterfall {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const startingMrr = events
    .filter((e) => new Date(e.event_date) < monthStart)
    .reduce((sum, e) => sum + e.mrr_change, 0);

  const inMonth = events.filter((e) => {
    const d = new Date(e.event_date);
    return d >= monthStart && d <= monthEnd;
  });

  const sumByType = (type: SubscriptionEventRow["event_type"]) =>
    inMonth.filter((e) => e.event_type === type).reduce((sum, e) => sum + e.mrr_change, 0);

  const newMrr = sumByType("new_subscription");
  const expansionMrr = sumByType("upgrade");
  const contractionMrr = sumByType("downgrade");
  const churnedMrr = sumByType("cancellation");

  return {
    starting_mrr: startingMrr,
    new_mrr: newMrr,
    expansion_mrr: expansionMrr,
    contraction_mrr: contractionMrr,
    churned_mrr: churnedMrr,
    ending_mrr: startingMrr + newMrr + expansionMrr + contractionMrr + churnedMrr,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/mrrTrend.test.ts platform/metrics/mrrWaterfall.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/mrrTrend.ts backend/platform/metrics/mrrWaterfall.ts backend/platform/metrics/mrrTrend.test.ts backend/platform/metrics/mrrWaterfall.test.ts
git commit -m "feat(backend): add MRR trend and MRR waterfall metric functions"
```

---

### Task 5: Customer growth + subscription breakdown metric functions

**Files:**
- Create: `backend/platform/metrics/customerGrowth.ts`
- Create: `backend/platform/metrics/subscriptionBreakdown.ts`
- Test: `backend/platform/metrics/customerGrowth.test.ts`
- Test: `backend/platform/metrics/subscriptionBreakdown.test.ts`

**Interfaces:**
- Consumes: `CompanyRow`, `SubscriptionRow` from Task 3; `trailingMonths`, `endOfMonth`, `monthKey` from Task 2.
- Produces: `computeCustomerGrowth(companies, subscriptions, now, monthCount?): {month, active_customers}[]`; `computeSubscriptionBreakdown(subscriptions): {plan_tier, count, mrr}[]` — both consumed by Task 9's endpoint.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/platform/metrics/customerGrowth.test.ts
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
```

```ts
// backend/platform/metrics/subscriptionBreakdown.test.ts
import { describe, it, expect } from "vitest";
import { computeSubscriptionBreakdown } from "./subscriptionBreakdown";
import type { SubscriptionRow } from "./types";

describe("computeSubscriptionBreakdown", () => {
  it("groups active subscriptions by plan tier with count and total MRR", () => {
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0002", plan_name: "starter", mrr_amount: 99, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0003", plan_name: "enterprise", mrr_amount: 5000, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0004", plan_name: "professional", mrr_amount: 499, status: "canceled", start_date: "2026-01-01", end_date: "2026-05-01" },
    ];

    const breakdown = computeSubscriptionBreakdown(subscriptions);

    expect(breakdown).toEqual([
      { plan_tier: "starter", count: 2, mrr: 198 },
      { plan_tier: "enterprise", count: 1, mrr: 5000 },
    ]);
  });

  it("returns tiers in fixed order (free, starter, professional, enterprise), omitting empty ones", () => {
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "enterprise", mrr_amount: 5000, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0002", plan_name: "free", mrr_amount: 0, status: "active", start_date: "2026-01-01", end_date: null },
    ];
    const breakdown = computeSubscriptionBreakdown(subscriptions);
    expect(breakdown.map((b) => b.plan_tier)).toEqual(["free", "enterprise"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/customerGrowth.test.ts platform/metrics/subscriptionBreakdown.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the functions**

```ts
// backend/platform/metrics/customerGrowth.ts
import type { CompanyRow, SubscriptionRow } from "./types";
import { endOfMonth, monthKey, trailingMonths } from "./months";

export interface CustomerGrowthPoint {
  month: string;
  active_customers: number;
}

export function computeCustomerGrowth(
  companies: CompanyRow[],
  subscriptions: SubscriptionRow[],
  now: Date,
  monthCount = 12,
): CustomerGrowthPoint[] {
  const subByCompany = new Map(subscriptions.map((s) => [s.company_id, s]));
  const months = trailingMonths(now, monthCount);

  return months.map((monthStart) => {
    const cutoff = endOfMonth(monthStart);
    const activeCount = companies.filter((c) => {
      if (new Date(c.signup_date) > cutoff) return false;
      const sub = subByCompany.get(c.id);
      if (!sub) return false;
      if (sub.status !== "canceled") return true;
      return sub.end_date !== null && new Date(sub.end_date) > cutoff;
    }).length;
    return { month: monthKey(monthStart), active_customers: activeCount };
  });
}
```

```ts
// backend/platform/metrics/subscriptionBreakdown.ts
import type { SubscriptionRow } from "./types";

export interface SubscriptionBreakdownRow {
  plan_tier: string;
  count: number;
  mrr: number;
}

const TIER_ORDER = ["free", "starter", "professional", "enterprise"];

export function computeSubscriptionBreakdown(subscriptions: SubscriptionRow[]): SubscriptionBreakdownRow[] {
  const active = subscriptions.filter((s) => s.status === "active");
  const byTier = new Map<string, { count: number; mrr: number }>();

  for (const sub of active) {
    const entry = byTier.get(sub.plan_name) ?? { count: 0, mrr: 0 };
    entry.count += 1;
    entry.mrr += sub.mrr_amount;
    byTier.set(sub.plan_name, entry);
  }

  return TIER_ORDER.filter((tier) => byTier.has(tier)).map((tier) => ({
    plan_tier: tier,
    ...byTier.get(tier)!,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/customerGrowth.test.ts platform/metrics/subscriptionBreakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/customerGrowth.ts backend/platform/metrics/subscriptionBreakdown.ts backend/platform/metrics/customerGrowth.test.ts backend/platform/metrics/subscriptionBreakdown.test.ts
git commit -m "feat(backend): add customer growth and subscription breakdown metric functions"
```

---

### Task 6: Churn rate + NRR metric functions

**Files:**
- Create: `backend/platform/metrics/churnRate.ts`
- Create: `backend/platform/metrics/nrr.ts`
- Test: `backend/platform/metrics/churnRate.test.ts`
- Test: `backend/platform/metrics/nrr.test.ts`

**Interfaces:**
- Consumes: `CompanyRow`, `SubscriptionRow`, `SubscriptionEventRow` from Task 3; `startOfMonth`, `endOfMonth` from Task 2.
- Produces: `computeChurnRate(companies, subscriptions, now): number` (a fraction, e.g. `0.05` for 5% — multiplied by 100 at the API layer in Task 9); `computeNrr(companies, events, now): number` (a ratio, e.g. `1.08` for 108% — also multiplied by 100 at the API layer) — both consumed by Task 9's endpoint, and `computeChurnRate`'s result is also consumed by Task 7's `computeClv`.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/platform/metrics/churnRate.test.ts
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
});
```

```ts
// backend/platform/metrics/nrr.test.ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/churnRate.test.ts platform/metrics/nrr.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the functions**

```ts
// backend/platform/metrics/churnRate.ts
import type { CompanyRow, SubscriptionRow } from "./types";
import { endOfMonth, startOfMonth } from "./months";

export function computeChurnRate(
  companies: CompanyRow[],
  subscriptions: SubscriptionRow[],
  now: Date,
): number {
  const monthStart = startOfMonth(now);
  const priorCutoff = new Date(monthStart.getTime() - 1);
  const subByCompany = new Map(subscriptions.map((s) => [s.company_id, s]));

  const activeAtMonthStart = companies.filter((c) => {
    if (new Date(c.signup_date) > priorCutoff) return false;
    const sub = subByCompany.get(c.id);
    if (!sub) return false;
    if (sub.status !== "canceled") return true;
    return sub.end_date !== null && new Date(sub.end_date) > priorCutoff;
  });

  if (activeAtMonthStart.length === 0) return 0;

  const monthEnd = endOfMonth(now);
  const churnedThisMonth = activeAtMonthStart.filter((c) => {
    const sub = subByCompany.get(c.id)!;
    return (
      sub.status === "canceled" &&
      sub.end_date !== null &&
      new Date(sub.end_date) >= monthStart &&
      new Date(sub.end_date) <= monthEnd
    );
  }).length;

  return churnedThisMonth / activeAtMonthStart.length;
}
```

```ts
// backend/platform/metrics/nrr.ts
import type { CompanyRow, SubscriptionEventRow } from "./types";
import { endOfMonth, startOfMonth } from "./months";

export function computeNrr(
  companies: CompanyRow[],
  events: SubscriptionEventRow[],
  now: Date,
): number {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const priorCutoff = new Date(monthStart.getTime() - 1);

  const existingCompanyIds = new Set(
    companies.filter((c) => new Date(c.signup_date) <= priorCutoff).map((c) => c.id),
  );

  const startingMrr = events
    .filter((e) => existingCompanyIds.has(e.company_id) && new Date(e.event_date) < monthStart)
    .reduce((sum, e) => sum + e.mrr_change, 0);

  if (startingMrr === 0) return 0;

  const netChangeThisMonth = events
    .filter(
      (e) =>
        existingCompanyIds.has(e.company_id) &&
        e.event_type !== "new_subscription" &&
        new Date(e.event_date) >= monthStart &&
        new Date(e.event_date) <= monthEnd,
    )
    .reduce((sum, e) => sum + e.mrr_change, 0);

  return (startingMrr + netChangeThisMonth) / startingMrr;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/churnRate.test.ts platform/metrics/nrr.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/churnRate.ts backend/platform/metrics/nrr.ts backend/platform/metrics/churnRate.test.ts backend/platform/metrics/nrr.test.ts
git commit -m "feat(backend): add churn rate and NRR metric functions"
```

---

### Task 7: CAC + CLV metric functions

**Files:**
- Create: `backend/platform/metrics/cac.ts`
- Create: `backend/platform/metrics/clv.ts`
- Test: `backend/platform/metrics/cac.test.ts`
- Test: `backend/platform/metrics/clv.test.ts`

**Interfaces:**
- Consumes: `MarketingSpendRow`, `SubscriptionEventRow`, `SubscriptionRow` from Task 3; `startOfMonth` from Task 2.
- Produces: `computeCac(spend, events, now): number`; `computeClv(subscriptions, monthlyChurnRate): number` — both consumed by Task 9's endpoint. `computeClv` takes Task 6's `computeChurnRate` result as its second argument (the endpoint computes churn rate once and passes it to both the KPI response and this function).

- [ ] **Step 1: Write the failing tests**

```ts
// backend/platform/metrics/cac.test.ts
import { describe, it, expect } from "vitest";
import { computeCac } from "./cac";
import type { MarketingSpendRow, SubscriptionEventRow } from "./types";

describe("computeCac", () => {
  it("divides this month's spend by this month's new paying customers", () => {
    const now = new Date(2026, 6, 15); // July
    const spend: MarketingSpendRow[] = [
      { month: "2026-06-01", amount: 1000 },
      { month: "2026-07-01", amount: 3000 },
    ];
    const events: SubscriptionEventRow[] = [
      { company_id: "CMP-0001", event_date: "2026-07-05", event_type: "new_subscription", mrr_change: 99 },
      { company_id: "CMP-0002", event_date: "2026-07-10", event_type: "new_subscription", mrr_change: 499 },
      { company_id: "CMP-0003", event_date: "2026-07-12", event_type: "new_subscription", mrr_change: 0 }, // free tier, excluded
      { company_id: "CMP-0004", event_date: "2026-06-01", event_type: "new_subscription", mrr_change: 99 }, // wrong month, excluded
    ];

    expect(computeCac(spend, events, now)).toBe(3000 / 2);
  });

  it("returns 0 when there are no new paying customers this month", () => {
    const now = new Date(2026, 6, 15);
    expect(computeCac([{ month: "2026-07-01", amount: 500 }], [], now)).toBe(0);
  });
});
```

```ts
// backend/platform/metrics/clv.test.ts
import { describe, it, expect } from "vitest";
import { computeClv } from "./clv";
import type { SubscriptionRow } from "./types";

describe("computeClv", () => {
  it("divides ARPU (paying customers only) by monthly churn rate", () => {
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 100, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0002", plan_name: "professional", mrr_amount: 500, status: "active", start_date: "2026-01-01", end_date: null },
      { company_id: "CMP-0003", plan_name: "free", mrr_amount: 0, status: "active", start_date: "2026-01-01", end_date: null },
    ];
    // ARPU over paying customers only: (100 + 500) / 2 = 300
    expect(computeClv(subscriptions, 0.05)).toBeCloseTo(300 / 0.05, 5);
  });

  it("returns 0 when churn rate is 0 or there are no paying customers", () => {
    expect(computeClv([], 0.05)).toBe(0);
    const subscriptions: SubscriptionRow[] = [
      { company_id: "CMP-0001", plan_name: "starter", mrr_amount: 100, status: "active", start_date: "2026-01-01", end_date: null },
    ];
    expect(computeClv(subscriptions, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/cac.test.ts platform/metrics/clv.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the functions**

```ts
// backend/platform/metrics/cac.ts
import type { MarketingSpendRow, SubscriptionEventRow } from "./types";
import { startOfMonth } from "./months";

export function computeCac(
  spend: MarketingSpendRow[],
  events: SubscriptionEventRow[],
  now: Date,
): number {
  const monthStart = startOfMonth(now);

  const spendRow = spend.find((s) => {
    const d = new Date(s.month);
    return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth();
  });
  const monthSpend = spendRow?.amount ?? 0;

  const newPayingCustomers = events.filter((e) => {
    const d = new Date(e.event_date);
    return (
      e.event_type === "new_subscription" &&
      e.mrr_change > 0 &&
      d.getFullYear() === monthStart.getFullYear() &&
      d.getMonth() === monthStart.getMonth()
    );
  }).length;

  return newPayingCustomers === 0 ? 0 : monthSpend / newPayingCustomers;
}
```

```ts
// backend/platform/metrics/clv.ts
import type { SubscriptionRow } from "./types";

export function computeClv(subscriptions: SubscriptionRow[], monthlyChurnRate: number): number {
  const paying = subscriptions.filter((s) => s.status === "active" && s.mrr_amount > 0);
  if (paying.length === 0 || monthlyChurnRate === 0) return 0;

  const arpu = paying.reduce((sum, s) => sum + s.mrr_amount, 0) / paying.length;
  return arpu / monthlyChurnRate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/cac.test.ts platform/metrics/clv.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/cac.ts backend/platform/metrics/clv.ts backend/platform/metrics/cac.test.ts backend/platform/metrics/clv.test.ts
git commit -m "feat(backend): add CAC and CLV metric functions"
```

---

### Task 8: Marketing spend seeding wiring

**Files:**
- Create: `backend/platform/marketingSpendSeed.ts`
- Test: `backend/platform/marketingSpendSeed.test.ts`

**Interfaces:**
- Consumes: `db` from `backend/platform/db.ts`; `generateMarketingSpend` from Task 3.
- Produces: `ensureMarketingSpendSeeded(): Promise<void>` — consumed by Task 9's endpoint (called alongside the existing `ensureSeeded()`, independently — this does not touch or re-trigger Phase 1's seeding).

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/marketingSpendSeed.test.ts
import { describe, it, expect } from "vitest";
import { ensureMarketingSpendSeeded } from "./marketingSpendSeed";
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/marketingSpendSeed.test.ts`
Expected: FAIL — `./marketingSpendSeed` module not found.

- [ ] **Step 3: Write the seeding wiring**

```ts
// backend/platform/marketingSpendSeed.ts
import { db } from "./db";
import { generateMarketingSpend } from "./generate/marketingSpend";

let marketingSpendSeeded: Promise<void> | null = null;

export function ensureMarketingSpendSeeded(): Promise<void> {
  if (!marketingSpendSeeded) marketingSpendSeeded = doSeedMarketingSpend();
  return marketingSpendSeeded;
}

async function doSeedMarketingSpend(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;
  if (existing && existing.n > 0) return;

  const rows = db.query<{ month: string; count: number }>`
    SELECT to_char(date_trunc('month', event_date), 'YYYY-MM-DD') AS month,
           COUNT(*)::int AS count
    FROM subscription_events
    WHERE event_type = 'new_subscription' AND mrr_change > 0
    GROUP BY date_trunc('month', event_date)
    ORDER BY date_trunc('month', event_date)
  `;
  const monthly: { month: string; count: number }[] = [];
  for await (const r of rows) monthly.push(r);

  const spendRows = generateMarketingSpend(monthly, 100);

  const tx = await db.begin();
  try {
    for (const row of spendRows) {
      await tx.rawExec(
        `INSERT INTO marketing_spend (id, month, amount) VALUES ($1, $2, $3)`,
        row.id,
        row.month,
        row.amount,
      );
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/marketingSpendSeed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/marketingSpendSeed.ts backend/platform/marketingSpendSeed.test.ts
git commit -m "feat(backend): wire marketing spend seeding against the live dataset"
```

---

### Task 9: executive-overview endpoint (replaces metrics/overview)

**Files:**
- Modify: `backend/platform/api.ts` (remove `metricsOverview` and its `MetricsOverviewResponse` interface; add `executiveOverview`)
- Modify: `backend/platform/api.test.ts` (remove the `metricsOverview` describe block; add one for `executiveOverview`)

**Interfaces:**
- Consumes: `ensureSeeded` (existing), `ensureMarketingSpendSeeded` from Task 8; all 8 metric functions from Tasks 4-7; row types from Task 3.
- Produces: `executiveOverview` exported Encore API handler at `GET /metrics/executive-overview` — consumed by the frontend in Tasks 10-13.

- [ ] **Step 1: Remove the old endpoint and its test**

Delete the `metricsOverview` export and `MetricsOverviewResponse` interface from `backend/platform/api.ts`, and delete the corresponding `describe("metricsOverview", ...)` block from `backend/platform/api.test.ts`.

- [ ] **Step 2: Write the failing test for the new endpoint**

```ts
// backend/platform/api.test.ts (append)
import { executiveOverview } from "./api";

describe("executiveOverview", () => {
  it("returns all 8 KPIs and all 4 chart datasets from real seeded data", async () => {
    const res = await executiveOverview();

    expect(res.kpis.mrr).toBeGreaterThan(0);
    expect(res.kpis.arr).toBeCloseTo(res.kpis.mrr * 12, 2);
    expect(res.kpis.customer_count).toBeGreaterThan(0);
    expect(typeof res.kpis.revenue_growth_pct).toBe("number");
    expect(typeof res.kpis.cac).toBe("number");
    expect(typeof res.kpis.clv).toBe("number");
    expect(typeof res.kpis.churn_rate_pct).toBe("number");
    expect(typeof res.kpis.nrr_pct).toBe("number");

    expect(res.charts.revenue_trend).toHaveLength(12);
    expect(res.charts.customer_growth).toHaveLength(12);
    expect(res.charts.subscription_breakdown.length).toBeGreaterThan(0);
    expect(res.charts.mrr_waterfall.ending_mrr).toBeCloseTo(
      res.charts.mrr_waterfall.starting_mrr +
        res.charts.mrr_waterfall.new_mrr +
        res.charts.mrr_waterfall.expansion_mrr +
        res.charts.mrr_waterfall.contraction_mrr +
        res.charts.mrr_waterfall.churned_mrr,
      2,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/api.test.ts`
Expected: FAIL — `executiveOverview` not exported from `./api`.

- [ ] **Step 4: Add the endpoint**

```ts
// backend/platform/api.ts (add these imports at the top, alongside the existing ones)
import { ensureMarketingSpendSeeded } from "./marketingSpendSeed";
import { computeMrrTrend } from "./metrics/mrrTrend";
import { computeMrrWaterfall } from "./metrics/mrrWaterfall";
import { computeCustomerGrowth } from "./metrics/customerGrowth";
import { computeSubscriptionBreakdown } from "./metrics/subscriptionBreakdown";
import { computeChurnRate } from "./metrics/churnRate";
import { computeNrr } from "./metrics/nrr";
import { computeCac } from "./metrics/cac";
import { computeClv } from "./metrics/clv";
import type {
  CompanyRow as MetricsCompanyRow,
  MarketingSpendRow,
  SubscriptionEventRow,
  SubscriptionRow as MetricsSubscriptionRow,
} from "./metrics/types";

// (add below the existing listCompanies export, in place of the removed metricsOverview)

interface ExecutiveOverviewResponse {
  kpis: {
    mrr: number;
    arr: number;
    revenue_growth_pct: number;
    customer_count: number;
    cac: number;
    clv: number;
    churn_rate_pct: number;
    nrr_pct: number;
  };
  charts: {
    revenue_trend: { month: string; mrr: number }[];
    mrr_waterfall: ReturnType<typeof computeMrrWaterfall>;
    customer_growth: { month: string; active_customers: number }[];
    subscription_breakdown: { plan_tier: string; count: number; mrr: number }[];
  };
}

export const executiveOverview = api(
  { method: "GET", path: "/metrics/executive-overview", expose: true },
  async (): Promise<ExecutiveOverviewResponse> => {
    await ensureSeeded();
    await ensureMarketingSpendSeeded();
    const now = new Date();

    const companies: MetricsCompanyRow[] = [];
    for await (const r of db.query<MetricsCompanyRow>`
      SELECT id, signup_date::text AS signup_date FROM companies
    `) {
      companies.push(r);
    }

    const subscriptions: MetricsSubscriptionRow[] = [];
    for await (const r of db.query<MetricsSubscriptionRow>`
      SELECT company_id, plan_name, mrr_amount::float AS mrr_amount, status,
             start_date::text AS start_date, end_date::text AS end_date
      FROM subscriptions
    `) {
      subscriptions.push(r);
    }

    const events: SubscriptionEventRow[] = [];
    for await (const r of db.query<SubscriptionEventRow>`
      SELECT company_id, event_date::text AS event_date, event_type, mrr_change::float AS mrr_change
      FROM subscription_events
    `) {
      events.push(r);
    }

    const spend: MarketingSpendRow[] = [];
    for await (const r of db.query<MarketingSpendRow>`
      SELECT month::text AS month, amount::float AS amount FROM marketing_spend
    `) {
      spend.push(r);
    }

    const revenueTrend = computeMrrTrend(events, now, 12);
    const mrrWaterfall = computeMrrWaterfall(events, now);
    const customerGrowth = computeCustomerGrowth(companies, subscriptions, now, 12);
    const subscriptionBreakdown = computeSubscriptionBreakdown(subscriptions);
    const churnRate = computeChurnRate(companies, subscriptions, now);
    const nrr = computeNrr(companies, events, now);
    const cac = computeCac(spend, events, now);
    const clv = computeClv(subscriptions, churnRate);

    const currentMrr = revenueTrend[revenueTrend.length - 1]?.mrr ?? 0;
    const previousMrr = revenueTrend[revenueTrend.length - 2]?.mrr ?? 0;
    const revenueGrowthPct = previousMrr === 0 ? 0 : ((currentMrr - previousMrr) / previousMrr) * 100;

    return {
      kpis: {
        mrr: currentMrr,
        arr: currentMrr * 12,
        revenue_growth_pct: revenueGrowthPct,
        customer_count: customerGrowth[customerGrowth.length - 1]?.active_customers ?? 0,
        cac,
        clv,
        churn_rate_pct: churnRate * 100,
        nrr_pct: nrr * 100,
      },
      charts: {
        revenue_trend: revenueTrend,
        mrr_waterfall: mrrWaterfall,
        customer_growth: customerGrowth,
        subscription_breakdown: subscriptionBreakdown,
      },
    };
  },
);
```

Note: the metrics-layer `CompanyRow`/`SubscriptionRow` types are aliased on import (`as MetricsCompanyRow`/`as MetricsSubscriptionRow`) because `api.ts` may already have similarly-named local interfaces (e.g. `CompanySummary`) — check for naming collisions when you add these imports and resolve with an alias if needed, following this pattern.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/api.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full backend suite**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all test files pass, no regressions from removing `metricsOverview`.

- [ ] **Step 7: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): replace metrics/overview with metrics/executive-overview"
```

---

### Task 10: Frontend — Recharts dependency, chart palette, types, API client

**Files:**
- Modify: `frontend/package.json` (add `recharts`)
- Modify: `frontend/app/globals.css` (add chart color CSS custom properties)
- Modify: `frontend/lib/types.ts` (add executive-overview types; remove `MetricsOverview`)
- Modify: `frontend/lib/api.ts` (add `getExecutiveOverview`; remove `getMetricsOverview`)

**Interfaces:**
- Produces: `ExecutiveOverview`, `RevenueTrendPoint`, `MrrWaterfall`, `CustomerGrowthPoint`, `SubscriptionBreakdownRow` types; `getExecutiveOverview(): Promise<ExecutiveOverview>` — consumed by Tasks 11-13's chart components and the dashboard page.
- Produces: CSS custom properties `--series-1` through `--series-4`, `--status-good`, `--status-critical`, `--chart-surface`, `--chart-grid`, `--chart-axis-muted` — consumed by every chart component in Tasks 11-12.

- [ ] **Step 1: Add Recharts**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npm install recharts@^2.15.0
```

- [ ] **Step 2: Add chart color custom properties to globals.css**

Check `frontend/app/globals.css` first — if it already defines chart-related custom properties (e.g. `--chart-1` through `--chart-5`, common in newer shadcn themes) under `:root` and a dark-mode block, read what's there before adding anything, to avoid duplicate/conflicting variable names. Then add the roles this plan's charts need, following the file's existing light/dark structure (likely `@media (prefers-color-scheme: dark)` plus a `data-theme="dark"` override, matching the pattern already established in this file from Task 11):

```css
:root {
  --series-1: #2a78d6;
  --series-2: #008300;
  --series-3: #e87ba4;
  --series-4: #eda100;
  --status-good: #0ca30c;
  --status-critical: #d03b3b;
  --chart-surface: #fcfcfb;
  --chart-grid: #e1e0d9;
  --chart-axis-muted: #898781;
}

@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    --series-1: #3987e5;
    --series-2: #008300;
    --series-3: #d55181;
    --series-4: #c98500;
    --status-good: #0ca30c;
    --status-critical: #e66767;
    --chart-surface: #1a1a19;
    --chart-grid: #2c2c2a;
    --chart-axis-muted: #898781;
  }
}

:root[data-theme="dark"] {
  --series-1: #3987e5;
  --series-2: #008300;
  --series-3: #d55181;
  --series-4: #c98500;
  --status-good: #0ca30c;
  --status-critical: #e66767;
  --chart-surface: #1a1a19;
  --chart-grid: #2c2c2a;
  --chart-axis-muted: #898781;
}
```

These values are the dataviz skill's validated reference palette (`references/palette.md`, categorical slots 1-4, status good/critical, chart chrome) — do not substitute different hex values without re-running the validator described in Step 7 below.

- [ ] **Step 3: Update lib/types.ts**

Remove the `MetricsOverview` interface. Add:

```ts
// frontend/lib/types.ts (additions)
export interface ExecutiveKpis {
  mrr: number;
  arr: number;
  revenue_growth_pct: number;
  customer_count: number;
  cac: number;
  clv: number;
  churn_rate_pct: number;
  nrr_pct: number;
}

export interface RevenueTrendPoint {
  month: string;
  mrr: number;
}

export interface MrrWaterfall {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

export interface CustomerGrowthPoint {
  month: string;
  active_customers: number;
}

export interface SubscriptionBreakdownRow {
  plan_tier: string;
  count: number;
  mrr: number;
}

export interface ExecutiveOverview {
  kpis: ExecutiveKpis;
  charts: {
    revenue_trend: RevenueTrendPoint[];
    mrr_waterfall: MrrWaterfall;
    customer_growth: CustomerGrowthPoint[];
    subscription_breakdown: SubscriptionBreakdownRow[];
  };
}
```

- [ ] **Step 4: Update lib/api.ts**

Remove `getMetricsOverview`. Add:

```ts
// frontend/lib/api.ts (addition)
import type { ExecutiveOverview } from "./types";

export async function getExecutiveOverview(): Promise<ExecutiveOverview> {
  const res = await fetch(`${API}/metrics/executive-overview`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /metrics/executive-overview failed: ${res.status}`);
  return res.json();
}
```

(`API` is the existing module-level constant already defined in this file from Phase 1 — reuse it, don't redeclare.)

- [ ] **Step 5: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors. (`app/dashboard/page.tsx` will fail to compile at this point since it still references `getMetricsOverview` — that's fixed in Task 13. If `tsc` fails ONLY on that file/reference, this step is still considered passing for this task; if it fails on anything else, fix it before proceeding.)

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/package.json frontend/package-lock.json frontend/app/globals.css frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): add recharts, chart palette, and executive-overview API client"
```

---

### Task 11: Revenue trend + customer growth chart components

**Files:**
- Create: `frontend/components/charts/RevenueTrendChart.tsx`
- Create: `frontend/components/charts/CustomerGrowthChart.tsx`

**Interfaces:**
- Consumes: `RevenueTrendPoint`, `CustomerGrowthPoint` types from Task 10; CSS custom properties (`--series-1`, `--chart-grid`, `--chart-axis-muted`, `--chart-surface`) from Task 10.
- Produces: `RevenueTrendChart({ data }: { data: RevenueTrendPoint[] })`, `CustomerGrowthChart({ data }: { data: CustomerGrowthPoint[] })` — consumed by Task 13's dashboard page.

- [ ] **Step 1: Write RevenueTrendChart**

```tsx
// frontend/components/charts/RevenueTrendChart.tsx
"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RevenueTrendPoint } from "@/lib/types";

function formatGbpCompact(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(value);
}

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="var(--chart-axis-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatGbpCompact}
          width={64}
        />
        <Tooltip
          formatter={(value: number) => [formatGbpCompact(value), "MRR"]}
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="mrr" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Write CustomerGrowthChart**

```tsx
// frontend/components/charts/CustomerGrowthChart.tsx
"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CustomerGrowthPoint } from "@/lib/types";

export function CustomerGrowthChart({ data }: { data: CustomerGrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          formatter={(value: number) => [value.toLocaleString(), "Active customers"]}
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="active_customers" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no new errors introduced by these two files (the pre-existing `getMetricsOverview` reference error from Task 10 is still expected here — fixed in Task 13).

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/components/charts/RevenueTrendChart.tsx frontend/components/charts/CustomerGrowthChart.tsx
git commit -m "feat(frontend): add revenue trend and customer growth line charts"
```

---

### Task 12: MRR waterfall + subscription breakdown chart components

**Files:**
- Create: `frontend/components/charts/MrrWaterfallChart.tsx`
- Create: `frontend/components/charts/SubscriptionBreakdownChart.tsx`

**Interfaces:**
- Consumes: `MrrWaterfall`, `SubscriptionBreakdownRow` types from Task 10; CSS custom properties (`--series-1..4`, `--status-good`, `--status-critical`, `--chart-grid`, `--chart-axis-muted`, `--chart-surface`) from Task 10.
- Produces: `MrrWaterfallChart({ data }: { data: MrrWaterfall })`, `SubscriptionBreakdownChart({ data }: { data: SubscriptionBreakdownRow[] })` — consumed by Task 13's dashboard page.

- [ ] **Step 1: Write MrrWaterfallChart**

```tsx
// frontend/components/charts/MrrWaterfallChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MrrWaterfall } from "@/lib/types";

function formatGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

interface WaterfallStep {
  label: string;
  base: number;
  value: number;
  displayValue: number;
  kind: "total" | "good" | "critical";
}

function deltaStep(label: string, cumulativeBefore: number, delta: number): WaterfallStep {
  return {
    label,
    base: Math.min(cumulativeBefore, cumulativeBefore + delta),
    value: Math.abs(delta),
    displayValue: delta,
    kind: delta >= 0 ? "good" : "critical",
  };
}

function buildSteps(w: MrrWaterfall): WaterfallStep[] {
  const afterNew = w.starting_mrr + w.new_mrr;
  const afterExpansion = afterNew + w.expansion_mrr;
  const afterContraction = afterExpansion + w.contraction_mrr;

  return [
    { label: "Starting MRR", base: 0, value: w.starting_mrr, displayValue: w.starting_mrr, kind: "total" },
    deltaStep("New", w.starting_mrr, w.new_mrr),
    deltaStep("Expansion", afterNew, w.expansion_mrr),
    deltaStep("Contraction", afterExpansion, w.contraction_mrr),
    deltaStep("Churn", afterContraction, w.churned_mrr),
    { label: "Ending MRR", base: 0, value: w.ending_mrr, displayValue: w.ending_mrr, kind: "total" },
  ];
}

const KIND_COLOR: Record<WaterfallStep["kind"], string> = {
  total: "var(--chart-axis-muted)",
  good: "var(--status-good)",
  critical: "var(--status-critical)",
};

export function MrrWaterfallChart({ data }: { data: MrrWaterfall }) {
  const steps = buildSteps(data);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={steps} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="var(--chart-axis-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatGbp}
          width={64}
        />
        <Tooltip
          formatter={(_value: number, _name: string, item: { payload?: WaterfallStep }) => [
            formatGbp(item.payload?.displayValue ?? 0),
            "MRR change",
          ]}
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 4, 4]}>
          {steps.map((step) => (
            <Cell key={step.label} fill={KIND_COLOR[step.kind]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Write SubscriptionBreakdownChart**

```tsx
// frontend/components/charts/SubscriptionBreakdownChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SubscriptionBreakdownRow } from "@/lib/types";

const TIER_COLORS: Record<string, string> = {
  free: "var(--series-1)",
  starter: "var(--series-2)",
  professional: "var(--series-3)",
  enterprise: "var(--series-4)",
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

export function SubscriptionBreakdownChart({ data }: { data: SubscriptionBreakdownRow[] }) {
  const row: Record<string, number | string> = { name: "Customers" };
  for (const item of data) row[item.plan_tier] = item.count;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={[row]} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" hide />
        <Tooltip contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }} />
        <Legend formatter={(value: string) => TIER_LABELS[value] ?? value} />
        {data.map((item) => (
          <Bar
            key={item.plan_tier}
            dataKey={item.plan_tier}
            stackId="a"
            fill={TIER_COLORS[item.plan_tier]}
            name={item.plan_tier}
            radius={[4, 4, 4, 4]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no new errors from these two files (the pre-existing `getMetricsOverview` reference error is still expected, fixed in Task 13).

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/components/charts/MrrWaterfallChart.tsx frontend/components/charts/SubscriptionBreakdownChart.tsx
git commit -m "feat(frontend): add MRR waterfall and subscription breakdown charts"
```

---

### Task 13: Wire into /dashboard, validate palette, final verification

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getExecutiveOverview` from Task 10; `RevenueTrendChart`, `CustomerGrowthChart` from Task 11; `MrrWaterfallChart`, `SubscriptionBreakdownChart` from Task 12.

- [ ] **Step 1: Rewrite the dashboard page's data fetch and KPI row**

Replace the `getMetricsOverview`/`getCompanies` fetch and the 4-item `kpis` array with:

```tsx
// frontend/app/dashboard/page.tsx
import { getCompanies, getExecutiveOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { CustomerGrowthChart } from "@/components/charts/CustomerGrowthChart";
import { MrrWaterfallChart } from "@/components/charts/MrrWaterfallChart";
import { SubscriptionBreakdownChart } from "@/components/charts/SubscriptionBreakdownChart";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function DashboardPage() {
  const [overview, companies] = await Promise.all([getExecutiveOverview(), getCompanies(25)]);
  const { kpis, charts } = overview;

  const kpiTiles = [
    { label: "MRR", value: formatCurrency(kpis.mrr) },
    { label: "ARR", value: formatCurrency(kpis.arr) },
    { label: "Revenue Growth", value: formatPercent(kpis.revenue_growth_pct) },
    { label: "Customer Count", value: kpis.customer_count.toLocaleString() },
    { label: "CAC", value: formatCurrency(kpis.cac) },
    { label: "CLV", value: formatCurrency(kpis.clv) },
    { label: "Churn Rate", value: formatPercent(kpis.churn_rate_pct) },
    { label: "NRR", value: formatPercent(kpis.nrr_pct) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Executive Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpiTiles.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{kpi.value}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={charts.revenue_trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerGrowthChart data={charts.customer_growth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MRR Waterfall (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <MrrWaterfallChart data={charts.mrr_waterfall} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <SubscriptionBreakdownChart data={charts.subscription_breakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Customer Stage</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.industry}</TableCell>
                  <TableCell className="capitalize">{c.plan_tier}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.customer_stage === "at_risk" || c.customer_stage === "churned"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {c.customer_stage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(c.mrr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Validate the chart palette**

Load the dataviz skill's validator against the categorical 4-color set and the status pair, for both light and dark surfaces (paths relative to wherever the dataviz skill is loaded from in this environment — locate `scripts/validate_palette.js` under the active dataviz skill directory):

```bash
node <dataviz-skill-dir>/scripts/validate_palette.js "#2a78d6,#008300,#e87ba4,#eda100" --mode light
node <dataviz-skill-dir>/scripts/validate_palette.js "#3987e5,#008300,#d55181,#c98500" --mode dark
```

Expected: PASS on the lightness band, chroma floor, adjacent-pair CVD separation, and normal-vision floor for both runs (these are the dataviz skill's own pre-validated reference values, so this should pass — if it doesn't, stop and report back with the validator's output rather than silently adjusting colors).

- [ ] **Step 4: Manual verification against the real backend**

With the Encore backend running (`cd backend && encore run`) and the frontend pointed at it, start the frontend briefly (per Phase 1's convention — a `timeout`-wrapped `next dev`, not a long-running session) and confirm:
- All 8 KPI tiles show non-placeholder, non-zero-where-expected values
- All 4 charts render with visible data (not empty/blank)
- The MRR waterfall's bars visually read as: two neutral bars (start/end) with green/red delta bars between them
- The subscription breakdown bar shows 4 colored segments with a legend

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && timeout 30 npm run dev &
```

- [ ] **Step 5: Run the full backend suite one more time**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/dashboard/page.tsx
git commit -m "feat(frontend): wire executive KPIs and 4 charts into /dashboard"
git push origin main
```

---
