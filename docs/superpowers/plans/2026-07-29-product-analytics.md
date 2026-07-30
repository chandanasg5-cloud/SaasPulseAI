# SaaSPulse AI — Phase 3 Product Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Product Analytics module at a new `/product` route — 5 KPIs (DAU/WAU/MAU/stickiness/feature adoption), the 5-stage activation funnel, feature usage ranking, and a cohort retention heatmap — computed entirely from Phase 1's existing `users`/`product_events`/`subscriptions` tables. No new migration.

**Architecture:** Same pattern as Phase 2 — pure, DB-free TypeScript metric functions in `backend/platform/metrics/`, each unit-tested with fixture rows, wired together by one consolidated `GET /metrics/product-overview` endpoint. The cohort retention heatmap is a custom HTML/CSS grid component (Recharts has no native heatmap), using the dataviz skill's sequential blue ramp.

**Tech Stack:** Encore.ts, Recharts (existing dependency), same shadcn/ui components as Phases 1-2.

## Global Constraints

- Unified "active user" definition: at least one `product_event` in the period. Used consistently for DAU/WAU/MAU, Feature Adoption Rate, and cohort retention — no second definition anywhere.
- `product_events.timestamp` and `users.first_login_at`/`created_at` are `TIMESTAMPTZ` — fetch them as **native `Date` objects** (no `::text` cast + re-parse). This is different from Phase 2's `DATE` columns, which needed `parseLocalDate` because bare date strings are UTC-ambiguous; a full timestamp with an offset is not ambiguous, and re-parsing a non-ISO `::text` output would risk a different bug.
- "Product Adoption" / Feature Adoption Rate = **3 or more distinct `feature_name` values** triggered by a user. One definition, reused by both the funnel and the KPI.
- "Paid Conversion" = the user's company has a subscription with `plan_name != 'free'`.
- Metric functions never import `db`/`encore.dev` — they take pre-fetched arrays and return computed values, kept reusable by the future AI Analyst Copilot (Phase 7).
- Test command: `encore test <path>` (not plain `npx vitest run`) for anything importing `encore.dev`; metric-function test files (pure, no `encore.dev` import) may use either, but use `encore test` throughout for consistency.
- Frontend verification: `npx tsc --noEmit`, never a long-running local `next dev`/`next build`.
- Chart colors from the dataviz skill's validated palette only — categorical for the 3-series engagement trend, sequential (single blue hue) for both bar charts and the heatmap. Validate via `validate_palette.js` before shipping.

---

### Task 1: Shared row types + stickiness function

**Files:**
- Modify: `backend/platform/metrics/types.ts` (add `UserRow`, `ProductEventRow`)
- Create: `backend/platform/metrics/stickiness.ts`
- Test: `backend/platform/metrics/stickiness.test.ts`

**Interfaces:**
- Produces: `UserRow` (`id`, `company_id`, `first_login_at: Date | null`, `created_at: Date`), `ProductEventRow` (`user_id`, `feature_name: string | null`, `timestamp: Date`) — consumed by Tasks 2-6. `computeStickiness(dau: number, mau: number): number` — consumed by Task 7's endpoint.

- [ ] **Step 1: Add the new row types**

```ts
// backend/platform/metrics/types.ts (append)
export interface UserRow {
  id: string;
  company_id: string;
  first_login_at: Date | null;
  created_at: Date;
}

export interface ProductEventRow {
  user_id: string;
  feature_name: string | null;
  timestamp: Date;
}
```

- [ ] **Step 2: Write the failing test for stickiness**

```ts
// backend/platform/metrics/stickiness.test.ts
import { describe, it, expect } from "vitest";
import { computeStickiness } from "./stickiness";

describe("computeStickiness", () => {
  it("returns dau/mau as a percentage", () => {
    expect(computeStickiness(50, 200)).toBeCloseTo(25, 5);
  });

  it("returns 0 when mau is 0", () => {
    expect(computeStickiness(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/stickiness.test.ts`
Expected: FAIL — `./stickiness` module not found.

- [ ] **Step 4: Write the function**

```ts
// backend/platform/metrics/stickiness.ts
export function computeStickiness(dau: number, mau: number): number {
  return mau === 0 ? 0 : (dau / mau) * 100;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/stickiness.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/types.ts backend/platform/metrics/stickiness.ts backend/platform/metrics/stickiness.test.ts
git commit -m "feat(backend): add product-analytics row types and stickiness function"
```

---

### Task 2: Engagement trend (DAU/WAU/MAU over trailing 30 days)

**Files:**
- Create: `backend/platform/metrics/engagementTrend.ts`
- Test: `backend/platform/metrics/engagementTrend.test.ts`

**Interfaces:**
- Consumes: `ProductEventRow` from Task 1.
- Produces: `computeEngagementTrend(events: ProductEventRow[], now: Date, dayCount?: number): {date: string; dau: number; wau: number; mau: number}[]` — consumed by Task 7's endpoint. The endpoint derives the `dau`/`wau`/`mau` KPI values from this function's **last** element rather than computing them separately (same pattern as Phase 2 deriving `currentMrr` from `revenueTrend`'s last element) — do not write a second, separate "current DAU/WAU/MAU" function.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/engagementTrend.test.ts
import { describe, it, expect } from "vitest";
import { computeEngagementTrend } from "./engagementTrend";
import type { ProductEventRow } from "./types";

describe("computeEngagementTrend", () => {
  const now = new Date(2026, 6, 30, 12, 0, 0); // July 30, 2026, midday

  it("returns dayCount points, oldest first, dates as YYYY-MM-DD", () => {
    const trend = computeEngagementTrend([], now, 5);
    expect(trend).toHaveLength(5);
    expect(trend.map((p) => p.date)).toEqual([
      "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
    ]);
  });

  it("counts distinct users active within each window ending on that day", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 6, 30, 9, 0) }, // today
      { user_id: "USR-002", feature_name: null, timestamp: new Date(2026, 6, 25, 9, 0) }, // 5 days ago — within WAU/MAU window of the last day, not DAU
      { user_id: "USR-003", feature_name: null, timestamp: new Date(2026, 5, 1, 9, 0) },  // June 1 — outside a 30-day window ending July 30
    ];
    const trend = computeEngagementTrend(events, now, 30);
    const lastPoint = trend[trend.length - 1];

    expect(lastPoint.dau).toBe(1); // only USR-001 active "today"
    expect(lastPoint.wau).toBe(2); // USR-001 + USR-002 (5 days ago is within trailing 7)
    expect(lastPoint.mau).toBe(2); // USR-003's June 1 event is outside the trailing-30-day window ending July 30
  });

  it("a user active only on day 1 of a 30-day window no longer counts in a later day's DAU", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: null, timestamp: new Date(2026, 6, 1, 9, 0) },
    ];
    const trend = computeEngagementTrend(events, now, 30);
    const firstPoint = trend[0]; // 2026-07-01 (30 days before/including July 30, starts July 1)
    const lastPoint = trend[trend.length - 1];

    expect(firstPoint.dau).toBe(1);
    expect(lastPoint.dau).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/engagementTrend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/engagementTrend.ts
import type { ProductEventRow } from "./types";

export interface EngagementTrendPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeEngagementTrend(
  events: ProductEventRow[],
  now: Date,
  dayCount = 30,
): EngagementTrendPoint[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const points: EngagementTrendPoint[] = [];

  for (let i = dayCount - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * 86_400_000);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
    const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
    const monthStart = new Date(dayStart.getTime() - 29 * 86_400_000);

    const dau = new Set<string>();
    const wau = new Set<string>();
    const mau = new Set<string>();

    for (const e of events) {
      const t = e.timestamp;
      if (t > dayEnd) continue;
      if (t >= monthStart) mau.add(e.user_id);
      if (t >= weekStart) wau.add(e.user_id);
      if (t >= dayStart) dau.add(e.user_id);
    }

    points.push({ date: dateKey(dayStart), dau: dau.size, wau: wau.size, mau: mau.size });
  }

  return points;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/engagementTrend.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/engagementTrend.ts backend/platform/metrics/engagementTrend.test.ts
git commit -m "feat(backend): add engagement trend (DAU/WAU/MAU) function"
```

---

### Task 3: Activation funnel

**Files:**
- Create: `backend/platform/metrics/activationFunnel.ts`
- Test: `backend/platform/metrics/activationFunnel.test.ts`

**Interfaces:**
- Consumes: `UserRow`, `ProductEventRow` from Task 1.
- Produces: `computeActivationFunnel(users: UserRow[], events: ProductEventRow[], paidCompanyIds: Set<string>): {stage: string; count: number}[]` — consumed by Task 7's endpoint. `paidCompanyIds` is built by the endpoint from `subscriptions` (`plan_name !== "free"`), not by this function.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/activationFunnel.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/activationFunnel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/activationFunnel.ts
import type { ProductEventRow, UserRow } from "./types";

export interface FunnelStage {
  stage: "signup" | "first_login" | "first_feature_usage" | "product_adoption" | "paid_conversion";
  count: number;
}

export function computeActivationFunnel(
  users: UserRow[],
  events: ProductEventRow[],
  paidCompanyIds: Set<string>,
): FunnelStage[] {
  const featuresByUser = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.feature_name) continue;
    const set = featuresByUser.get(e.user_id) ?? new Set<string>();
    set.add(e.feature_name);
    featuresByUser.set(e.user_id, set);
  }

  const signup = users.length;
  const firstLogin = users.filter((u) => u.first_login_at !== null).length;
  const firstFeatureUsage = users.filter((u) => (featuresByUser.get(u.id)?.size ?? 0) >= 1).length;
  const productAdoption = users.filter((u) => (featuresByUser.get(u.id)?.size ?? 0) >= 3).length;
  const paidConversion = users.filter((u) => paidCompanyIds.has(u.company_id)).length;

  return [
    { stage: "signup", count: signup },
    { stage: "first_login", count: firstLogin },
    { stage: "first_feature_usage", count: firstFeatureUsage },
    { stage: "product_adoption", count: productAdoption },
    { stage: "paid_conversion", count: paidConversion },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/activationFunnel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/activationFunnel.ts backend/platform/metrics/activationFunnel.test.ts
git commit -m "feat(backend): add activation funnel function"
```

---

### Task 4: Feature adoption rate

**Files:**
- Create: `backend/platform/metrics/featureAdoptionRate.ts`
- Test: `backend/platform/metrics/featureAdoptionRate.test.ts`

**Interfaces:**
- Consumes: `ProductEventRow` from Task 1.
- Produces: `computeFeatureAdoptionRate(events: ProductEventRow[], now: Date): number` — consumed by Task 7's endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/featureAdoptionRate.test.ts
import { describe, it, expect } from "vitest";
import { computeFeatureAdoptionRate } from "./featureAdoptionRate";
import type { ProductEventRow } from "./types";

describe("computeFeatureAdoptionRate", () => {
  const now = new Date(2026, 6, 30);

  it("is the percentage of active-in-last-30-days users who used 3+ distinct features", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-001", feature_name: "reports", timestamp: new Date(2026, 6, 26) },
      { user_id: "USR-001", feature_name: "api", timestamp: new Date(2026, 6, 27) },
      { user_id: "USR-002", feature_name: "dashboard", timestamp: new Date(2026, 6, 28) },
    ];
    // 2 active users in the trailing 30 days; only USR-001 has 3+ distinct features
    expect(computeFeatureAdoptionRate(events, now)).toBeCloseTo(50, 5);
  });

  it("excludes events older than 30 days from the active-user denominator", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-002", feature_name: "reports", timestamp: new Date(2026, 4, 1) }, // outside window
    ];
    expect(computeFeatureAdoptionRate(events, now)).toBe(0); // only USR-001 active, 1 feature
  });

  it("returns 0 when there are no active users", () => {
    expect(computeFeatureAdoptionRate([], now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/featureAdoptionRate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/featureAdoptionRate.ts
import type { ProductEventRow } from "./types";

export function computeFeatureAdoptionRate(events: ProductEventRow[], now: Date): number {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStart = new Date(todayStart.getTime() - 29 * 86_400_000);

  const featuresByUser = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.timestamp < windowStart) continue;
    const set = featuresByUser.get(e.user_id) ?? new Set<string>();
    if (e.feature_name) set.add(e.feature_name);
    featuresByUser.set(e.user_id, set);
  }

  const activeUserIds = [...featuresByUser.keys()];
  if (activeUserIds.length === 0) return 0;

  const adopted = activeUserIds.filter((id) => (featuresByUser.get(id)?.size ?? 0) >= 3).length;
  return (adopted / activeUserIds.length) * 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/featureAdoptionRate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/featureAdoptionRate.ts backend/platform/metrics/featureAdoptionRate.test.ts
git commit -m "feat(backend): add feature adoption rate function"
```

---

### Task 5: Feature usage ranking

**Files:**
- Create: `backend/platform/metrics/featureUsageRanking.ts`
- Test: `backend/platform/metrics/featureUsageRanking.test.ts`

**Interfaces:**
- Consumes: `ProductEventRow` from Task 1.
- Produces: `computeFeatureUsageRanking(events: ProductEventRow[]): {feature_name: string; event_count: number}[]` (sorted descending by count) — consumed by Task 7's endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/featureUsageRanking.test.ts
import { describe, it, expect } from "vitest";
import { computeFeatureUsageRanking } from "./featureUsageRanking";
import type { ProductEventRow } from "./types";

describe("computeFeatureUsageRanking", () => {
  it("counts events per feature and sorts descending", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date() },
      { user_id: "USR-002", feature_name: "dashboard", timestamp: new Date() },
      { user_id: "USR-003", feature_name: "reports", timestamp: new Date() },
      { user_id: "USR-001", feature_name: null, timestamp: new Date() }, // no feature, excluded
    ];
    const ranking = computeFeatureUsageRanking(events);
    expect(ranking).toEqual([
      { feature_name: "dashboard", event_count: 2 },
      { feature_name: "reports", event_count: 1 },
    ]);
  });

  it("returns an empty array when there are no feature-tagged events", () => {
    expect(computeFeatureUsageRanking([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/featureUsageRanking.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/featureUsageRanking.ts
import type { ProductEventRow } from "./types";

export interface FeatureUsageRow {
  feature_name: string;
  event_count: number;
}

export function computeFeatureUsageRanking(events: ProductEventRow[]): FeatureUsageRow[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.feature_name) continue;
    counts.set(e.feature_name, (counts.get(e.feature_name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([feature_name, event_count]) => ({ feature_name, event_count }))
    .sort((a, b) => b.event_count - a.event_count);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/featureUsageRanking.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/featureUsageRanking.ts backend/platform/metrics/featureUsageRanking.test.ts
git commit -m "feat(backend): add feature usage ranking function"
```

---

### Task 6: Cohort retention

**Files:**
- Create: `backend/platform/metrics/cohortRetention.ts`
- Test: `backend/platform/metrics/cohortRetention.test.ts`

**Interfaces:**
- Consumes: `UserRow`, `ProductEventRow` from Task 1; `monthKey`, `trailingMonths` from `./months` (existing, Phase 2).
- Produces: `computeCohortRetention(users: UserRow[], events: ProductEventRow[], now: Date, cohortMonths?: number): {cohort_month: string; months_since_signup: number; retention_pct: number}[]` — consumed by Task 7's endpoint. Output is triangular (a cohort from N months ago has at most N+1 observed data points) — do not pad with zero-filled future cells; the frontend heatmap component handles the triangular shape.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/cohortRetention.test.ts
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
    expect(byOffset[2]).toBeCloseTo(50, 5); // only USR-001 active month 2
  });

  it("produces triangular data — a recent cohort has fewer observed offsets than an old one", () => {
    const now = new Date(2026, 2, 15); // March 2026
    const users: UserRow[] = [
      { id: "USR-001", company_id: "CMP-001", first_login_at: null, created_at: new Date(2026, 2, 1) }, // March cohort, signed up this month
    ];
    const cells = computeCohortRetention(users, [], now, 3);
    const marCells = cells.filter((c) => c.cohort_month === "2026-03");

    expect(marCells.map((c) => c.months_since_signup)).toEqual([0]); // only offset 0 is observable so far
  });

  it("omits cohort months with zero signups entirely", () => {
    const now = new Date(2026, 2, 15);
    const cells = computeCohortRetention([], [], now, 3);
    expect(cells).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/cohortRetention.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/cohortRetention.ts
import type { ProductEventRow, UserRow } from "./types";
import { monthKey, trailingMonths } from "./months";

export interface CohortRetentionCell {
  cohort_month: string;
  months_since_signup: number;
  retention_pct: number;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function computeCohortRetention(
  users: UserRow[],
  events: ProductEventRow[],
  now: Date,
  cohortMonths = 12,
): CohortRetentionCell[] {
  const cohorts = new Map<string, string[]>();
  for (const u of users) {
    const key = monthKey(u.created_at);
    const arr = cohorts.get(key) ?? [];
    arr.push(u.id);
    cohorts.set(key, arr);
  }

  const activeMonthsByUser = new Map<string, Set<string>>();
  for (const e of events) {
    const key = monthKey(e.timestamp);
    const set = activeMonthsByUser.get(e.user_id) ?? new Set<string>();
    set.add(key);
    activeMonthsByUser.set(e.user_id, set);
  }

  const cells: CohortRetentionCell[] = [];

  for (const cohortMonthDate of trailingMonths(now, cohortMonths)) {
    const cohortKey = monthKey(cohortMonthDate);
    const cohortUserIds = cohorts.get(cohortKey);
    if (!cohortUserIds || cohortUserIds.length === 0) continue;

    const maxOffset = monthsBetween(cohortMonthDate, now);
    for (let offset = 0; offset <= maxOffset; offset++) {
      const targetMonth = new Date(cohortMonthDate.getFullYear(), cohortMonthDate.getMonth() + offset, 1);
      const targetKey = monthKey(targetMonth);
      const retained = cohortUserIds.filter((id) => activeMonthsByUser.get(id)?.has(targetKey)).length;
      cells.push({
        cohort_month: cohortKey,
        months_since_signup: offset,
        retention_pct: (retained / cohortUserIds.length) * 100,
      });
    }
  }

  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/cohortRetention.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/cohortRetention.ts backend/platform/metrics/cohortRetention.test.ts
git commit -m "feat(backend): add cohort retention function"
```

---

### Task 7: product-overview endpoint

**Files:**
- Modify: `backend/platform/api.ts` (add `productOverview`)
- Modify: `backend/platform/api.test.ts` (add a test for it)

**Interfaces:**
- Consumes: `ensureSeeded` (existing); all 6 metric functions from Tasks 2-6 (`computeEngagementTrend`, `computeActivationFunnel`, `computeFeatureAdoptionRate`, `computeFeatureUsageRanking`, `computeCohortRetention`, `computeStickiness`); `UserRow`/`ProductEventRow` from Task 1; the existing `SubscriptionRow` type from `./metrics/types` (Phase 2).
- Produces: `productOverview` exported Encore API handler at `GET /metrics/product-overview` — consumed by the frontend in Tasks 8-12.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/api.test.ts (append)
import { productOverview } from "./api";

describe("productOverview", () => {
  it("returns all 5 KPIs, the 5-stage funnel, and all 3 chart datasets from real seeded data", async () => {
    const res = await productOverview();

    expect(res.kpis.dau).toBeGreaterThanOrEqual(0);
    expect(res.kpis.wau).toBeGreaterThanOrEqual(res.kpis.dau);
    expect(res.kpis.mau).toBeGreaterThanOrEqual(res.kpis.wau);
    expect(typeof res.kpis.stickiness_pct).toBe("number");
    expect(typeof res.kpis.feature_adoption_pct).toBe("number");

    expect(res.funnel).toHaveLength(5);
    expect(res.funnel.map((f) => f.stage)).toEqual([
      "signup", "first_login", "first_feature_usage", "product_adoption", "paid_conversion",
    ]);
    // Each stage's count should never exceed the previous stage's (funnel narrows or holds, never widens)
    for (let i = 1; i < res.funnel.length; i++) {
      expect(res.funnel[i].count).toBeLessThanOrEqual(res.funnel[i - 1].count);
    }

    expect(res.charts.feature_usage_ranking.length).toBeGreaterThan(0);
    expect(res.charts.engagement_trend).toHaveLength(30);
    expect(res.charts.cohort_retention.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/api.test.ts`
Expected: FAIL — `productOverview` not exported from `./api`.

- [ ] **Step 3: Add the endpoint**

```ts
// backend/platform/api.ts (add these imports alongside the existing ones)
import { computeStickiness } from "./metrics/stickiness";
import { computeEngagementTrend } from "./metrics/engagementTrend";
import { computeActivationFunnel } from "./metrics/activationFunnel";
import { computeFeatureAdoptionRate } from "./metrics/featureAdoptionRate";
import { computeFeatureUsageRanking } from "./metrics/featureUsageRanking";
import { computeCohortRetention } from "./metrics/cohortRetention";
import type { UserRow as MetricsUserRow, ProductEventRow as MetricsProductEventRow } from "./metrics/types";

// (add below the existing executiveOverview export)

interface ProductOverviewResponse {
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    stickiness_pct: number;
    feature_adoption_pct: number;
  };
  funnel: { stage: string; count: number }[];
  charts: {
    feature_usage_ranking: { feature_name: string; event_count: number }[];
    engagement_trend: { date: string; dau: number; wau: number; mau: number }[];
    cohort_retention: { cohort_month: string; months_since_signup: number; retention_pct: number }[];
  };
}

export const productOverview = api(
  { method: "GET", path: "/metrics/product-overview", expose: true },
  async (): Promise<ProductOverviewResponse> => {
    await ensureSeeded();
    const now = new Date();

    const users: MetricsUserRow[] = [];
    for await (const r of db.query<MetricsUserRow>`
      SELECT id, company_id, first_login_at, created_at FROM users
    `) {
      users.push(r);
    }

    const events: MetricsProductEventRow[] = [];
    for await (const r of db.query<MetricsProductEventRow>`
      SELECT user_id, feature_name, "timestamp" FROM product_events
    `) {
      events.push(r);
    }

    const paidCompanyIds = new Set<string>();
    for await (const r of db.query<{ company_id: string }>`
      SELECT company_id FROM subscriptions WHERE plan_name != 'free'
    `) {
      paidCompanyIds.add(r.company_id);
    }

    const engagementTrend = computeEngagementTrend(events, now, 30);
    const lastPoint = engagementTrend[engagementTrend.length - 1];
    const dau = lastPoint?.dau ?? 0;
    const wau = lastPoint?.wau ?? 0;
    const mau = lastPoint?.mau ?? 0;

    return {
      kpis: {
        dau,
        wau,
        mau,
        stickiness_pct: computeStickiness(dau, mau),
        feature_adoption_pct: computeFeatureAdoptionRate(events, now),
      },
      funnel: computeActivationFunnel(users, events, paidCompanyIds),
      charts: {
        feature_usage_ranking: computeFeatureUsageRanking(events),
        engagement_trend: engagementTrend,
        cohort_retention: computeCohortRetention(users, events, now, 12),
      },
    };
  },
);
```

Note: `db.query<MetricsUserRow>` and `db.query<MetricsProductEventRow>` rely on Encore's underlying `pg` driver returning `TIMESTAMPTZ` columns as native JS `Date` objects (no `::text` cast) — this is the standard `pg` driver behavior and matches the design spec's explicit decision to avoid re-parsing timestamp strings. If a query result comes back with string dates instead of `Date` instances (check by logging a row, or if a metric function's comparisons behave unexpectedly), this is the one thing to verify against `backend/node_modules/pg`'s type parsing — do not silently add a `::text` cast + custom parser without checking this first, since that was explicitly the approach this design decided against.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/api.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): add metrics/product-overview endpoint"
```

---

### Task 8: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts` (add product-overview types)
- Modify: `frontend/lib/api.ts` (add `getProductOverview`)

**Interfaces:**
- Produces: `ProductKpis`, `FunnelStage`, `FeatureUsageRow`, `EngagementTrendPoint`, `CohortRetentionCell`, `ProductOverview` types; `getProductOverview(): Promise<ProductOverview>` — consumed by Tasks 9-12.

- [ ] **Step 1: Add the response types**

```ts
// frontend/lib/types.ts (append)
export interface ProductKpis {
  dau: number;
  wau: number;
  mau: number;
  stickiness_pct: number;
  feature_adoption_pct: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface FeatureUsageRow {
  feature_name: string;
  event_count: number;
}

export interface EngagementTrendPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface CohortRetentionCell {
  cohort_month: string;
  months_since_signup: number;
  retention_pct: number;
}

export interface ProductOverview {
  kpis: ProductKpis;
  funnel: FunnelStage[];
  charts: {
    feature_usage_ranking: FeatureUsageRow[];
    engagement_trend: EngagementTrendPoint[];
    cohort_retention: CohortRetentionCell[];
  };
}
```

- [ ] **Step 2: Add the API client function**

```ts
// frontend/lib/api.ts (append)
import type { ProductOverview } from "./types";

export async function getProductOverview(): Promise<ProductOverview> {
  const res = await fetch(`${API}/metrics/product-overview`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /metrics/product-overview failed: ${res.status}`);
  return res.json();
}
```

(Merge this `import type { ProductOverview }` into the existing type-only import line at the top of `lib/api.ts` rather than adding a second import statement; reuse the existing `API` constant.)

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): add product-overview types and API client"
```

---

### Task 9: Feature usage ranking + activation funnel charts

**Files:**
- Create: `frontend/components/charts/FeatureUsageRankingChart.tsx`
- Create: `frontend/components/charts/ActivationFunnelChart.tsx`

**Interfaces:**
- Consumes: `FeatureUsageRow`, `FunnelStage` types from Task 8; CSS custom properties `--series-1`, `--chart-grid`, `--chart-axis-muted`, `--chart-surface` (existing, Phase 2).
- Produces: `FeatureUsageRankingChart({ data }: { data: FeatureUsageRow[] })`, `ActivationFunnelChart({ data }: { data: FunnelStage[] })` — consumed by Task 12's `/product` page.

Both are horizontal bar charts using Recharts' `layout="vertical"` (Recharts' naming: `layout="vertical"` means the bars themselves run horizontally, category axis on the left) with a single sequential hue (`--series-1`) — this is a "compare magnitude" job, not identity, so one hue throughout, not one color per bar.

- [ ] **Step 1: Write FeatureUsageRankingChart**

```tsx
// frontend/components/charts/FeatureUsageRankingChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FeatureUsageRow } from "@/lib/types";

// Keys are `feature_name` values (from backend/platform/generate/events.ts's
// EVENT_CATALOG), not `event_name` values — several event names share one
// feature (report_created/report_exported -> "reports", etc.).
const FEATURE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  reports: "Reports",
  data_import: "Data Import",
  integrations: "Integrations",
  automation: "Automation",
  workflows: "Workflows",
  api: "API",
  team: "Team",
  billing: "Billing",
  support: "Support",
};

function humanizeFeature(name: string): string {
  return FEATURE_LABELS[name] ?? name;
}

export function FeatureUsageRankingChart({ data }: { data: FeatureUsageRow[] }) {
  const chartData = data.map((d) => ({ ...d, label: humanizeFeature(d.feature_name) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke="var(--chart-axis-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip
          formatter={(value: number) => [value.toLocaleString(), "Events"]}
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Bar dataKey="event_count" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Write ActivationFunnelChart**

```tsx
// frontend/components/charts/ActivationFunnelChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FunnelStage } from "@/lib/types";

const STAGE_LABELS: Record<string, string> = {
  signup: "Signup",
  first_login: "First Login",
  first_feature_usage: "First Feature Usage",
  product_adoption: "Product Adoption",
  paid_conversion: "Paid Conversion",
};

export function ActivationFunnelChart({ data }: { data: FunnelStage[] }) {
  const chartData = data.map((d) => ({ ...d, label: STAGE_LABELS[d.stage] ?? d.stage }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke="var(--chart-axis-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip
          formatter={(value: number) => [value.toLocaleString(), "Users"]}
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Bar dataKey="count" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Note: `ActivationFunnelChart` renders stages in the ORDER they're given (signup → paid_conversion), not sorted by count — the backend already returns them in stage order, so no client-side sorting should be added here.

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no new errors (a pre-existing error in `app/product/page.tsx` doesn't exist yet — this task doesn't touch any page, so `tsc` should be fully clean at this point).

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/components/charts/FeatureUsageRankingChart.tsx frontend/components/charts/ActivationFunnelChart.tsx
git commit -m "feat(frontend): add feature usage ranking and activation funnel charts"
```

---

### Task 10: Engagement trend chart (3-series)

**Files:**
- Create: `frontend/components/charts/EngagementTrendChart.tsx`

**Interfaces:**
- Consumes: `EngagementTrendPoint` type from Task 8; CSS custom properties `--series-1`, `--series-2`, `--series-3`, `--chart-grid`, `--chart-axis-muted`, `--chart-surface` (existing, Phase 2).
- Produces: `EngagementTrendChart({ data }: { data: EngagementTrendPoint[] })` — consumed by Task 12's `/product` page.

This is a categorical color job (3 distinct, simultaneously-visible series that must be told apart), unlike the single-hue bar charts in Task 9 — DAU/WAU/MAU share a unit (user count) so all three plot on one y-axis with no dual-axis issue, but they need 3 different hues plus a legend (per the dataviz skill's series-count ladder: 2+ series always gets a legend).

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/charts/EngagementTrendChart.tsx
"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EngagementTrendPoint } from "@/lib/types";

const SERIES_LABELS: Record<string, string> = { dau: "DAU", wau: "WAU", mau: "MAU" };

export function EngagementTrendChart({ data }: { data: EngagementTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Legend formatter={(value: string) => SERIES_LABELS[value] ?? value} />
        <Line type="monotone" dataKey="dau" name="dau" stroke="var(--series-1)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="wau" name="wau" stroke="var(--series-2)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="mau" name="mau" stroke="var(--series-3)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/components/charts/EngagementTrendChart.tsx
git commit -m "feat(frontend): add engagement trend chart (DAU/WAU/MAU)"
```

---

### Task 11: Cohort retention heatmap

**Files:**
- Modify: `frontend/app/globals.css` (add sequential blue ramp CSS custom properties)
- Create: `frontend/components/charts/CohortRetentionHeatmap.tsx`

**Interfaces:**
- Consumes: `CohortRetentionCell` type from Task 8.
- Produces: `CohortRetentionHeatmap({ data }: { data: CohortRetentionCell[] })` — consumed by Task 12's `/product` page. New CSS custom properties `--seq-1` through `--seq-7` (light→dark in light mode; the same named steps but running dark→light in dark mode, so "low value" always sits closest to that mode's own chart surface) — consumed only by this component.

**Recharts has no native heatmap chart type** — this is a custom HTML/CSS grid, not a Recharts component, matching how the dataviz skill's "heatmap for a grid" form is meant to be built when no chart library primitive exists for it.

- [ ] **Step 1: Add the sequential ramp to globals.css**

Before writing these values, read the dataviz skill's `references/palette.md` "Sequential hue" section and its "ordinal ramp" contrast-floor note directly (locate the active dataviz skill directory first) to confirm the exact hex steps and the light/dark contrast-floor guidance below — this task's reasoning is derived from that file, but verify it rather than trust this transcription blindly, the same discipline earlier tasks applied to Encore/Recharts APIs.

Add to `frontend/app/globals.css`, following the file's existing structure (light `:root`, `@media (prefers-color-scheme: dark)` block, `:root[data-theme="dark"]` block):

```css
:root {
  --seq-1: #86b6ef; /* lightest allowed on light surface per the ordinal-ramp 2:1 floor (step 250) */
  --seq-2: #6da7ec;
  --seq-3: #3987e5;
  --seq-4: #2a78d6;
  --seq-5: #1c5cab;
  --seq-6: #104281;
  --seq-7: #0d366b; /* darkest step, highest value */
}

@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    --seq-1: #184f95; /* darkest allowed on dark surface per the ordinal-ramp 2:1 floor (step 600) — this is the LOW-value end in dark mode */
    --seq-2: #1c5cab;
    --seq-3: #256abf;
    --seq-4: #3987e5;
    --seq-5: #6da7ec;
    --seq-6: #9ec5f4;
    --seq-7: #cde2fb; /* lightest step, highest value in dark mode — receding toward the dark surface only happens at the LOW end (--seq-1) */
  }
}

:root[data-theme="dark"] {
  --seq-1: #184f95;
  --seq-2: #1c5cab;
  --seq-3: #256abf;
  --seq-4: #3987e5;
  --seq-5: #6da7ec;
  --seq-6: #9ec5f4;
  --seq-7: #cde2fb;
}
```

`--seq-1` is always the LOW-value color and `--seq-7` is always the HIGH-value color, regardless of mode — the actual hex values differ between light/dark (light mode gets darker as value increases; dark mode gets lighter as value increases) so each mode's low end stays close to its own chart surface, matching the "recede toward the surface at the low end" principle. The component in Step 2 should reference `--seq-1` through `--seq-7` by role and never need mode-specific logic itself.

- [ ] **Step 2: Write the heatmap component**

```tsx
// frontend/components/charts/CohortRetentionHeatmap.tsx
"use client";

import type { CohortRetentionCell } from "@/lib/types";

const SEQ_STEPS = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];

function colorForRetention(pct: number): string {
  const stepIndex = Math.min(SEQ_STEPS.length - 1, Math.floor((pct / 100) * SEQ_STEPS.length));
  return `var(${SEQ_STEPS[stepIndex]})`;
}

export function CohortRetentionHeatmap({ data }: { data: CohortRetentionCell[] }) {
  const cohortMonths = [...new Set(data.map((d) => d.cohort_month))].sort();
  const maxOffset = data.reduce((max, d) => Math.max(max, d.months_since_signup), 0);
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  const cellByKey = new Map(data.map((d) => [`${d.cohort_month}:${d.months_since_signup}`, d]));

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-muted-foreground">Cohort</th>
            {offsets.map((o) => (
              <th key={o} className="p-1 text-center font-normal text-muted-foreground">M{o}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohortMonths.map((month) => (
            <tr key={month}>
              <td className="whitespace-nowrap p-1 text-muted-foreground">{month}</td>
              {offsets.map((offset) => {
                const cell = cellByKey.get(`${month}:${offset}`);
                if (!cell) return <td key={offset} className="p-1" />;
                return (
                  <td
                    key={offset}
                    className="p-1 text-center"
                    style={{ background: colorForRetention(cell.retention_pct) }}
                    title={`${month}, month ${offset}: ${cell.retention_pct.toFixed(0)}% retained`}
                  >
                    {cell.retention_pct.toFixed(0)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Cells with no data (the triangular gap — a recent cohort has no observed value for a large offset) render as an empty `<td>` with no background, rather than a zero-value colored cell, so "not yet observed" is visually distinct from "0% retained."

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/globals.css frontend/components/charts/CohortRetentionHeatmap.tsx
git commit -m "feat(frontend): add cohort retention heatmap with sequential blue ramp"
```

---

### Task 12: Wire into new /product page, validate palette, final verification

**Files:**
- Create: `frontend/app/product/page.tsx`

**Interfaces:**
- Consumes: `getProductOverview` from Task 8; `FeatureUsageRankingChart`, `ActivationFunnelChart` from Task 9; `EngagementTrendChart` from Task 10; `CohortRetentionHeatmap` from Task 11.

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/product/page.tsx
import { getProductOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureUsageRankingChart } from "@/components/charts/FeatureUsageRankingChart";
import { ActivationFunnelChart } from "@/components/charts/ActivationFunnelChart";
import { EngagementTrendChart } from "@/components/charts/EngagementTrendChart";
import { CohortRetentionHeatmap } from "@/components/charts/CohortRetentionHeatmap";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function ProductPage() {
  const overview = await getProductOverview();
  const { kpis, funnel, charts } = overview;

  const kpiTiles = [
    { label: "DAU", value: kpis.dau.toLocaleString() },
    { label: "WAU", value: kpis.wau.toLocaleString() },
    { label: "MAU", value: kpis.mau.toLocaleString() },
    { label: "Stickiness", value: formatPercent(kpis.stickiness_pct) },
    { label: "Feature Adoption", value: formatPercent(kpis.feature_adoption_pct) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Product Analytics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
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
            <CardTitle>Activation Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivationFunnelChart data={funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature Usage Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureUsageRankingChart data={charts.feature_usage_ranking} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engagement Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <EngagementTrendChart data={charts.engagement_trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cohort Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <CohortRetentionHeatmap data={charts.cohort_retention} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors — this should be fully clean, not just "no new errors," since no file in this whole phase should have been left in a broken state.

- [ ] **Step 3: Validate the sequential palette**

The `--seq-*` steps (final, corrected values from Task 11) are a **sequential** ramp (continuous magnitude — this is `palette.md`'s own named "heatmaps" example), not an **ordinal** one (discrete ordered marks like funnel stages/tiers). Per `color-formula.md`: "running the categorical [or ordinal] validator on a sequential ramp will FAIL by design... which is expected, not a real failure; don't 'fix' a good ramp to satisfy it." Do NOT run this with `--ordinal` — that check enforces a 2:1 light-end contrast floor that sequential ramps are explicitly exempt from (their low end is *supposed* to recede toward the surface). The checks that actually apply to a sequential ramp are lightness monotonicity, adjacent-step visibility (ΔL), and single-hue — verify those pass; a "Light-end contrast" FAIL under `--ordinal` on this ramp is not a real failure and must not be "fixed" by altering the palette.

Locate the active dataviz skill's `scripts/validate_palette.js` and use the Task 11 CSS values as-committed (the categorical `--series-*` set was already validated in Phase 2 and is unchanged).

- [ ] **Step 4: Manual verification against the real backend**

With the Encore backend running (`cd backend && encore run`) and the frontend pointed at it, briefly start the frontend (per this project's established convention — never a long-running `next dev` session) and confirm:
- All 5 KPI tiles show real values
- The activation funnel bar shows 5 stages, monotonically non-increasing left-to-right (top-to-bottom in the rendered chart)
- The feature usage ranking bar shows real feature names and counts
- The engagement trend line shows 3 distinguishable colored lines with a legend
- The cohort retention grid renders with varying blue shading and no layout overflow

- [ ] **Step 5: Run the full backend suite one more time**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/product/page.tsx
git commit -m "feat(frontend): add /product page with KPIs, funnel, and 3 charts"
git push origin main
```

---
