# SaaSPulse AI — Phase 4 Customer Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/customers` page showing a 0-100 Health Score per active company (4 sub-scores, risk level, deterministic recommended action), computed live from Phase 1's existing tables. No new migration; `customer_health_scores` stays empty by design.

**Architecture:** Same pure-function pattern as Phases 2-3 — 6 small metric functions in `backend/platform/metrics/`, one consolidated `GET /customers/health-scores` endpoint, a `CustomerCard` component, and a paginated `/customers` page.

**Tech Stack:** Encore.ts (unchanged), same shadcn/ui components as Phases 1-3, no new frontend dependencies.

## Global Constraints

- Feature Adoption Score MUST reuse Phase 3's `computeFeatureAdoptionRate` (imported, not reimplemented) divided by 4 — one definition of "adopted" everywhere in this project.
- Usage Score's "active" definition is the same unified one from Phase 3 (≥1 `product_event` in the trailing 30 days) — do not invent a different activity threshold.
- Active companies only: a company is excluded if its subscription `status = 'canceled' AND end_date <= CURRENT_DATE` (the same "actual churn" definition already used in `companiesCount`, Phase 1).
- Risk bands: overall ≥70 = `low`, 40-69 = `medium`, <40 = `high`. These are inclusive boundaries — 70 is `low`, 40 is `medium`, 39 is `high`.
- Recommended-action tie-breaking (when two sub-scores are equally weakest/strongest): resolve in the fixed order usage → adoption → support → revenue (first in that order wins).
- `product_events.timestamp`, `users.first_login_at`/`created_at`, `support_tickets.created_at` are `TIMESTAMPTZ` — fetch as native `Date` objects, never `::text`-cast (same discipline as Phase 3, avoiding a repeat of the UTC/local bug class).
- Metric functions never import `db`/`encore.dev`.
- Test command: `encore test <path>` for anything importing `encore.dev`; use it throughout for consistency.
- Frontend verification: `npx tsc --noEmit`, never a long-running `next dev`/`next build`.
- This project has a documented history of "placebo tests" (5 prior instances across Phases 2-3) — before shipping any test, ask "would this assertion actually fail if the specific behavior it verifies were broken?" If unsure, trace it by hand or by temporarily breaking the code and re-running.
- Risk badges use the dataviz skill's status palette via a small colored dot + text label (icon + label pairing), never a color-only or background-tinted-badge encoding — this matches the skill's own documented rule that status colors "never carry meaning alone."

---

### Task 1: Shared row types + usage score function

**Files:**
- Modify: `backend/platform/metrics/types.ts` (add `CompanyEventRow`, `SupportTicketRow`)
- Create: `backend/platform/metrics/usageScore.ts`
- Test: `backend/platform/metrics/usageScore.test.ts`

**Interfaces:**
- Produces: `CompanyEventRow` (`company_id`, `user_id`, `feature_name: string | null`, `timestamp: Date`) — a company-scoped variant of Phase 3's `ProductEventRow`, needed because Phase 4 groups events by company at the endpoint level before per-company scoring (`product_events.company_id` is a real column, more efficient than deriving it via a user→company join). `SupportTicketRow` (`company_id`, `priority: "low"|"medium"|"high"|"urgent"`, `created_at: Date`) — consumed by Task 3.
- Produces: `computeUsageScore(companyUsers: UserRow[], companyEvents: ProductEventRow[], now: Date): number` — consumed by Task 6's endpoint. Takes Phase 3's plain `ProductEventRow` (no `company_id` — the endpoint converts `CompanyEventRow[]` to `ProductEventRow[]` per company before calling this and Task 2's function), not `CompanyEventRow`, since this function only ever receives one company's events at a time.

- [ ] **Step 1: Add the new row types**

```ts
// backend/platform/metrics/types.ts (append)
export interface CompanyEventRow {
  company_id: string;
  user_id: string;
  feature_name: string | null;
  timestamp: Date;
}

export interface SupportTicketRow {
  company_id: string;
  priority: "low" | "medium" | "high" | "urgent";
  created_at: Date;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// backend/platform/metrics/usageScore.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/usageScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the function**

```ts
// backend/platform/metrics/usageScore.ts
import type { ProductEventRow, UserRow } from "./types";

export function computeUsageScore(
  companyUsers: UserRow[],
  companyEvents: ProductEventRow[],
  now: Date,
): number {
  if (companyUsers.length === 0) return 0;

  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const activeUserIds = new Set<string>();
  for (const e of companyEvents) {
    if (e.timestamp >= windowStart) activeUserIds.add(e.user_id);
  }

  const activeCount = companyUsers.filter((u) => activeUserIds.has(u.id)).length;
  return (activeCount / companyUsers.length) * 25;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/usageScore.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/types.ts backend/platform/metrics/usageScore.ts backend/platform/metrics/usageScore.test.ts
git commit -m "feat(backend): add customer-intelligence row types and usage score function"
```

---

### Task 2: Feature adoption score (reuses Phase 3's rate function)

**Files:**
- Create: `backend/platform/metrics/featureAdoptionScore.ts`
- Test: `backend/platform/metrics/featureAdoptionScore.test.ts`

**Interfaces:**
- Consumes: `computeFeatureAdoptionRate` from `./featureAdoptionRate` (Phase 3, already exists — do NOT reimplement its logic).
- Produces: `computeFeatureAdoptionScore(companyEvents: ProductEventRow[], now: Date): number` — consumed by Task 6's endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/featureAdoptionScore.test.ts
import { describe, it, expect } from "vitest";
import { computeFeatureAdoptionScore } from "./featureAdoptionScore";
import { computeFeatureAdoptionRate } from "./featureAdoptionRate";
import type { ProductEventRow } from "./types";

describe("computeFeatureAdoptionScore", () => {
  const now = new Date(2026, 6, 30);

  it("is computeFeatureAdoptionRate divided by 4 (0-100 rate -> 0-25 score)", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-001", feature_name: "dashboard", timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-001", feature_name: "reports", timestamp: new Date(2026, 6, 26) },
      { user_id: "USR-001", feature_name: "api", timestamp: new Date(2026, 6, 27) },
      { user_id: "USR-002", feature_name: "dashboard", timestamp: new Date(2026, 6, 28) },
    ];
    const rate = computeFeatureAdoptionRate(events, now);
    expect(computeFeatureAdoptionScore(events, now)).toBeCloseTo(rate / 4, 5);
    // Sanity-check the actual number too, not just the ratio to itself:
    // 2 active users, only USR-001 has 3+ distinct features -> rate = 50, score = 12.5
    expect(computeFeatureAdoptionScore(events, now)).toBeCloseTo(12.5, 5);
  });

  it("returns 0 when there are no active users", () => {
    expect(computeFeatureAdoptionScore([], now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/featureAdoptionScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/featureAdoptionScore.ts
import type { ProductEventRow } from "./types";
import { computeFeatureAdoptionRate } from "./featureAdoptionRate";

export function computeFeatureAdoptionScore(events: ProductEventRow[], now: Date): number {
  return computeFeatureAdoptionRate(events, now) / 4;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/featureAdoptionScore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/featureAdoptionScore.ts backend/platform/metrics/featureAdoptionScore.test.ts
git commit -m "feat(backend): add feature adoption score (reuses Phase 3's adoption rate)"
```

---

### Task 3: Support score

**Files:**
- Create: `backend/platform/metrics/supportScore.ts`
- Test: `backend/platform/metrics/supportScore.test.ts`

**Interfaces:**
- Consumes: `SupportTicketRow` from Task 1.
- Produces: `computeSupportScore(companyTickets: SupportTicketRow[], now: Date): number` — consumed by Task 6's endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/supportScore.test.ts
import { describe, it, expect } from "vitest";
import { computeSupportScore } from "./supportScore";
import type { SupportTicketRow } from "./types";

describe("computeSupportScore", () => {
  const now = new Date(2026, 6, 30);

  it("starts at 25 and subtracts a severity-weighted penalty per ticket in the trailing 90 days", () => {
    const tickets: SupportTicketRow[] = [
      { company_id: "CMP-001", priority: "low", created_at: new Date(2026, 6, 1) },    // -1
      { company_id: "CMP-001", priority: "high", created_at: new Date(2026, 5, 15) },  // -3
      { company_id: "CMP-001", priority: "urgent", created_at: new Date(2026, 6, 20) }, // -5
    ];
    // 25 - (1 + 3 + 5) = 16
    expect(computeSupportScore(tickets, now)).toBe(16);
  });

  it("excludes tickets older than 90 days", () => {
    const tickets: SupportTicketRow[] = [
      { company_id: "CMP-001", priority: "urgent", created_at: new Date(2026, 0, 1) }, // ~180 days before now
    ];
    expect(computeSupportScore(tickets, now)).toBe(25);
  });

  it("floors at 0 rather than going negative", () => {
    const tickets: SupportTicketRow[] = Array.from({ length: 10 }, (_, i) => ({
      company_id: "CMP-001",
      priority: "urgent" as const,
      created_at: new Date(2026, 6, 1 + i),
    }));
    // 10 urgent tickets * 5 = 50 penalty, would go to -25 without the floor
    expect(computeSupportScore(tickets, now)).toBe(0);
  });

  it("returns 25 for a company with no tickets", () => {
    expect(computeSupportScore([], now)).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/supportScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/supportScore.ts
import type { SupportTicketRow } from "./types";

const PRIORITY_WEIGHT: Record<SupportTicketRow["priority"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 5,
};

export function computeSupportScore(companyTickets: SupportTicketRow[], now: Date): number {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);

  const penalty = companyTickets
    .filter((t) => t.created_at >= windowStart)
    .reduce((sum, t) => sum + PRIORITY_WEIGHT[t.priority], 0);

  return Math.max(0, 25 - penalty);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/supportScore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/supportScore.ts backend/platform/metrics/supportScore.test.ts
git commit -m "feat(backend): add support score function"
```

---

### Task 4: Revenue score

**Files:**
- Create: `backend/platform/metrics/revenueScore.ts`
- Test: `backend/platform/metrics/revenueScore.test.ts`

**Interfaces:**
- Produces: `RevenueScoreInput` (`plan_name: string`, `status: string`) — a minimal subset type, NOT the full Phase 2 `SubscriptionRow`, since this function only needs these two fields; `computeRevenueScore(subscription: RevenueScoreInput): number` — consumed by Task 6's endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/metrics/revenueScore.test.ts
import { describe, it, expect } from "vitest";
import { computeRevenueScore } from "./revenueScore";

describe("computeRevenueScore", () => {
  it("scores by plan tier: free=5, starter=12, professional=18, enterprise=25", () => {
    expect(computeRevenueScore({ plan_name: "free", status: "active" })).toBe(5);
    expect(computeRevenueScore({ plan_name: "starter", status: "active" })).toBe(12);
    expect(computeRevenueScore({ plan_name: "professional", status: "active" })).toBe(18);
    expect(computeRevenueScore({ plan_name: "enterprise", status: "active" })).toBe(25);
  });

  it("halves the score when status is past_due", () => {
    expect(computeRevenueScore({ plan_name: "enterprise", status: "past_due" })).toBe(12.5);
    expect(computeRevenueScore({ plan_name: "starter", status: "past_due" })).toBe(6);
  });

  it("does not halve for active or trialing status", () => {
    expect(computeRevenueScore({ plan_name: "professional", status: "trialing" })).toBe(18);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/revenueScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the function**

```ts
// backend/platform/metrics/revenueScore.ts
export interface RevenueScoreInput {
  plan_name: string;
  status: string;
}

const TIER_BASE_POINTS: Record<string, number> = {
  free: 5,
  starter: 12,
  professional: 18,
  enterprise: 25,
};

export function computeRevenueScore(subscription: RevenueScoreInput): number {
  const base = TIER_BASE_POINTS[subscription.plan_name] ?? 0;
  return subscription.status === "past_due" ? base / 2 : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/revenueScore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/revenueScore.ts backend/platform/metrics/revenueScore.test.ts
git commit -m "feat(backend): add revenue score function"
```

---

### Task 5: Health score + recommended action

**Files:**
- Create: `backend/platform/metrics/healthScore.ts`
- Create: `backend/platform/metrics/recommendedAction.ts`
- Test: `backend/platform/metrics/healthScore.test.ts`
- Test: `backend/platform/metrics/recommendedAction.test.ts`

**Interfaces:**
- Produces: `HealthScore` interface (`usage_score`, `adoption_score`, `support_score`, `revenue_score`, `overall_score`, `risk_level: "low"|"medium"|"high"`); `computeHealthScore(usageScore, adoptionScore, supportScore, revenueScore): HealthScore` — consumed by Task 6's endpoint and by `computeRecommendedAction` below.
- Produces: `computeRecommendedAction(score: HealthScore): string` — consumed by Task 6's endpoint.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/platform/metrics/healthScore.test.ts
import { describe, it, expect } from "vitest";
import { computeHealthScore } from "./healthScore";

describe("computeHealthScore", () => {
  it("sums the 4 sub-scores into overall_score", () => {
    const result = computeHealthScore(20, 15, 22, 18);
    expect(result.overall_score).toBe(75);
    expect(result.usage_score).toBe(20);
    expect(result.adoption_score).toBe(15);
    expect(result.support_score).toBe(22);
    expect(result.revenue_score).toBe(18);
  });

  it("bands risk_level: >=70 low, 40-69 medium, <40 high (inclusive boundaries)", () => {
    expect(computeHealthScore(20, 20, 20, 10).overall_score).toBe(70);
    expect(computeHealthScore(20, 20, 20, 10).risk_level).toBe("low"); // exactly 70 -> low
    expect(computeHealthScore(10, 10, 10, 10).overall_score).toBe(40);
    expect(computeHealthScore(10, 10, 10, 10).risk_level).toBe("medium"); // exactly 40 -> medium
    expect(computeHealthScore(10, 10, 9, 9).overall_score).toBe(38);
    expect(computeHealthScore(10, 10, 9, 9).risk_level).toBe("high"); // 39 or below -> high
  });
});
```

```ts
// backend/platform/metrics/recommendedAction.test.ts
import { describe, it, expect } from "vitest";
import { computeRecommendedAction } from "./recommendedAction";
import { computeHealthScore } from "./healthScore";

describe("computeRecommendedAction", () => {
  it("suggests an upgrade discussion for low-risk accounts where revenue is the strongest sub-score", () => {
    const score = computeHealthScore(18, 18, 18, 25); // revenue clearly strongest, overall=79 -> low risk
    expect(computeRecommendedAction(score)).toBe("Consider enterprise upgrade discussion");
  });

  it("suggests maintaining touchpoints for low-risk accounts where revenue is NOT the strongest", () => {
    const score = computeHealthScore(25, 18, 18, 18); // usage strongest, overall=79 -> low risk
    expect(computeRecommendedAction(score)).toBe("Healthy account — maintain regular touchpoints");
  });

  it("recommends a feature adoption walkthrough for medium-risk accounts with weak adoption", () => {
    const score = computeHealthScore(15, 5, 15, 15); // adoption weakest, overall=50 -> medium risk
    expect(computeRecommendedAction(score)).toBe("Offer a feature adoption walkthrough to increase usage depth");
  });

  it("recommends urgent re-engagement for high-risk accounts with weak usage", () => {
    const score = computeHealthScore(2, 10, 10, 10); // usage weakest, overall=32 -> high risk
    expect(computeRecommendedAction(score)).toBe("Urgent: re-engagement campaign needed — usage has dropped significantly");
  });

  it("recommends an urgent support check-in for high-risk accounts with weak support", () => {
    const score = computeHealthScore(10, 10, 2, 10); // support weakest, overall=32 -> high risk
    expect(computeRecommendedAction(score)).toBe("Urgent: schedule a customer success check-in to resolve support issues");
  });

  it("breaks ties in fixed order usage -> adoption -> support -> revenue", () => {
    // usage and adoption tied at the weakest value; usage must win the tie
    const score = computeHealthScore(5, 5, 15, 15); // overall=40 -> medium risk
    expect(computeRecommendedAction(score)).toBe("Re-engagement outreach recommended — usage has softened");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/healthScore.test.ts platform/metrics/recommendedAction.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the functions**

```ts
// backend/platform/metrics/healthScore.ts
export interface HealthScore {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  overall_score: number;
  risk_level: "low" | "medium" | "high";
}

export function computeHealthScore(
  usageScore: number,
  adoptionScore: number,
  supportScore: number,
  revenueScore: number,
): HealthScore {
  const overall = usageScore + adoptionScore + supportScore + revenueScore;
  const riskLevel: HealthScore["risk_level"] = overall >= 70 ? "low" : overall >= 40 ? "medium" : "high";

  return {
    usage_score: usageScore,
    adoption_score: adoptionScore,
    support_score: supportScore,
    revenue_score: revenueScore,
    overall_score: overall,
    risk_level: riskLevel,
  };
}
```

```ts
// backend/platform/metrics/recommendedAction.ts
import type { HealthScore } from "./healthScore";

type SubScoreKey = "usage_score" | "adoption_score" | "support_score" | "revenue_score";

const SUBSCORE_ORDER: SubScoreKey[] = ["usage_score", "adoption_score", "support_score", "revenue_score"];

function findWeakest(score: HealthScore): SubScoreKey {
  let weakest = SUBSCORE_ORDER[0];
  for (const key of SUBSCORE_ORDER) {
    if (score[key] < score[weakest]) weakest = key;
  }
  return weakest;
}

function findStrongest(score: HealthScore): SubScoreKey {
  let strongest = SUBSCORE_ORDER[0];
  for (const key of SUBSCORE_ORDER) {
    if (score[key] > score[strongest]) strongest = key;
  }
  return strongest;
}

export function computeRecommendedAction(score: HealthScore): string {
  if (score.risk_level === "low") {
    return findStrongest(score) === "revenue_score"
      ? "Consider enterprise upgrade discussion"
      : "Healthy account — maintain regular touchpoints";
  }

  const weakest = findWeakest(score);
  const urgent = score.risk_level === "high";

  if (weakest === "adoption_score") {
    return urgent
      ? "Urgent: schedule an onboarding refresher — feature adoption is very low"
      : "Offer a feature adoption walkthrough to increase usage depth";
  }
  if (weakest === "usage_score") {
    return urgent
      ? "Urgent: re-engagement campaign needed — usage has dropped significantly"
      : "Re-engagement outreach recommended — usage has softened";
  }
  if (weakest === "support_score") {
    return urgent
      ? "Urgent: schedule a customer success check-in to resolve support issues"
      : "Review recent support history — proactively check in";
  }
  return urgent
    ? "Urgent: address payment/plan issues before renewal"
    : "Monitor for renewal risk given plan/payment status";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/metrics/healthScore.test.ts platform/metrics/recommendedAction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/healthScore.ts backend/platform/metrics/recommendedAction.ts backend/platform/metrics/healthScore.test.ts backend/platform/metrics/recommendedAction.test.ts
git commit -m "feat(backend): add health score aggregation and recommended action rule table"
```

---

### Task 6: customers/health-scores endpoint

**Files:**
- Modify: `backend/platform/api.ts` (add `customerHealthScores`)
- Modify: `backend/platform/api.test.ts` (add a test for it)

**Interfaces:**
- Consumes: `ensureSeeded`; all 6 metric functions from Tasks 1-5; `CompanyEventRow`, `SupportTicketRow`, `UserRow`, `ProductEventRow` from `./metrics/types`.
- Produces: `customerHealthScores` exported Encore API handler at `GET /customers/health-scores` — consumed by the frontend in Tasks 7-9.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/api.test.ts (append)
import { customerHealthScores } from "./api";

describe("customerHealthScores", () => {
  it("returns paginated, real-computed health scores for active companies only", async () => {
    const res = await customerHealthScores({ page: 1, pageSize: 10 });

    expect(res.customers).toHaveLength(10);
    expect(res.total).toBeGreaterThan(0);

    for (const c of res.customers) {
      expect(c.overall_score).toBeCloseTo(
        c.usage_score + c.adoption_score + c.support_score + c.revenue_score,
        5,
      );
      expect(["low", "medium", "high"]).toContain(c.risk_level);
      expect(typeof c.recommended_action).toBe("string");
      expect(c.recommended_action.length).toBeGreaterThan(0);
    }
  });

  it("excludes churned companies", async () => {
    const res = await customerHealthScores({ page: 1, pageSize: 100 });
    const churnedRow = await db.queryRow`
      SELECT c.id FROM companies c
      JOIN subscriptions s ON s.company_id = c.id
      WHERE s.status = 'canceled' AND s.end_date <= CURRENT_DATE
      LIMIT 1
    `;
    if (churnedRow) {
      expect(res.customers.some((c) => c.company_id === churnedRow.id)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test platform/api.test.ts`
Expected: FAIL — `customerHealthScores` not exported from `./api`.

- [ ] **Step 3: Add the endpoint**

```ts
// backend/platform/api.ts (add these imports alongside the existing ones)
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeHealthScore } from "./metrics/healthScore";
import { computeRecommendedAction } from "./metrics/recommendedAction";
import type {
  CompanyEventRow,
  SupportTicketRow as MetricsSupportTicketRow,
  UserRow as HealthUserRow,
  ProductEventRow as HealthProductEventRow,
} from "./metrics/types";

// (add below the existing productOverview export)

interface ActiveCompanyRow {
  id: string;
  name: string;
  plan_tier: string;
  plan_name: string;
  status: string;
}

interface CustomerHealthCard {
  company_id: string;
  company_name: string;
  plan_tier: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  overall_score: number;
  risk_level: string;
  recommended_action: string;
}

interface CustomerHealthScoresParams {
  page?: Query<number>;
  pageSize?: Query<number>;
}

export const customerHealthScores = api(
  { method: "GET", path: "/customers/health-scores", expose: true },
  async (params: CustomerHealthScoresParams): Promise<{ customers: CustomerHealthCard[]; total: number }> => {
    await ensureSeeded();
    const now = new Date();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));

    const companies: ActiveCompanyRow[] = [];
    for await (const r of db.query<ActiveCompanyRow>`
      SELECT c.id, c.name, c.plan_tier, s.plan_name, s.status
      FROM companies c
      JOIN subscriptions s ON s.company_id = c.id
      WHERE NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
      ORDER BY c.id
    `) {
      companies.push(r);
    }

    const users: HealthUserRow[] = [];
    for await (const r of db.query<HealthUserRow>`
      SELECT id, company_id, first_login_at, created_at FROM users
    `) {
      users.push(r);
    }

    const events: CompanyEventRow[] = [];
    for await (const r of db.query<CompanyEventRow>`
      SELECT company_id, user_id, feature_name, "timestamp" FROM product_events
    `) {
      events.push(r);
    }

    const tickets: MetricsSupportTicketRow[] = [];
    for await (const r of db.query<MetricsSupportTicketRow>`
      SELECT company_id, priority, created_at FROM support_tickets
    `) {
      tickets.push(r);
    }

    const usersByCompany = new Map<string, HealthUserRow[]>();
    for (const u of users) {
      const arr = usersByCompany.get(u.company_id) ?? [];
      arr.push(u);
      usersByCompany.set(u.company_id, arr);
    }

    const eventsByCompany = new Map<string, CompanyEventRow[]>();
    for (const e of events) {
      const arr = eventsByCompany.get(e.company_id) ?? [];
      arr.push(e);
      eventsByCompany.set(e.company_id, arr);
    }

    const ticketsByCompany = new Map<string, MetricsSupportTicketRow[]>();
    for (const t of tickets) {
      const arr = ticketsByCompany.get(t.company_id) ?? [];
      arr.push(t);
      ticketsByCompany.set(t.company_id, arr);
    }

    const allCards: CustomerHealthCard[] = companies.map((c) => {
      const companyUsers = usersByCompany.get(c.id) ?? [];
      const companyEvents = eventsByCompany.get(c.id) ?? [];
      const companyTickets = ticketsByCompany.get(c.id) ?? [];
      const productEventRows: HealthProductEventRow[] = companyEvents.map((e) => ({
        user_id: e.user_id,
        feature_name: e.feature_name,
        timestamp: e.timestamp,
      }));

      const usageScore = computeUsageScore(companyUsers, productEventRows, now);
      const adoptionScore = computeFeatureAdoptionScore(productEventRows, now);
      const supportScore = computeSupportScore(companyTickets, now);
      const revenueScore = computeRevenueScore({ plan_name: c.plan_name, status: c.status });
      const health = computeHealthScore(usageScore, adoptionScore, supportScore, revenueScore);
      const recommendedAction = computeRecommendedAction(health);

      return {
        company_id: c.id,
        company_name: c.name,
        plan_tier: c.plan_tier,
        usage_score: health.usage_score,
        adoption_score: health.adoption_score,
        support_score: health.support_score,
        revenue_score: health.revenue_score,
        overall_score: health.overall_score,
        risk_level: health.risk_level,
        recommended_action: recommendedAction,
      };
    });

    const total = allCards.length;
    const start = (page - 1) * pageSize;
    const customers = allCards.slice(start, start + pageSize);

    return { customers, total };
  },
);
```

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
git commit -m "feat(backend): add customers/health-scores endpoint"
```

---

### Task 7: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts` (add `CustomerHealthCard`, `CustomerHealthScoresResponse`)
- Modify: `frontend/lib/api.ts` (add `getCustomerHealthScores`)

**Interfaces:**
- Produces: `CustomerHealthCard`, `CustomerHealthScoresResponse` types; `getCustomerHealthScores(page?: number, pageSize?: number): Promise<CustomerHealthScoresResponse>` — consumed by Tasks 8-9.

- [ ] **Step 1: Add the response types**

```ts
// frontend/lib/types.ts (append)
export interface CustomerHealthCard {
  company_id: string;
  company_name: string;
  plan_tier: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  overall_score: number;
  risk_level: string;
  recommended_action: string;
}

export interface CustomerHealthScoresResponse {
  customers: CustomerHealthCard[];
  total: number;
}
```

- [ ] **Step 2: Add the API client function**

```ts
// frontend/lib/api.ts (append)
import type { CustomerHealthScoresResponse } from "./types";

export async function getCustomerHealthScores(page = 1, pageSize = 25): Promise<CustomerHealthScoresResponse> {
  const res = await fetch(`${API}/customers/health-scores?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/health-scores failed: ${res.status}`);
  return res.json();
}
```

(Merge this `import type` into the existing type-only import line at the top of `lib/api.ts` rather than adding a second import statement; reuse the existing `API` constant.)

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): add customer-health-scores types and API client"
```

---

### Task 8: --status-warning CSS variable + CustomerCard component

**Files:**
- Modify: `frontend/app/globals.css` (add `--status-warning` to all three existing status-color blocks)
- Create: `frontend/components/CustomerCard.tsx`

**Interfaces:**
- Produces: `--status-warning` CSS custom property (light + both dark mechanisms, alongside the existing `--status-good`/`--status-critical` from Phase 2) — consumed by the component below.
- Produces: `CustomerCard({ customer }: { customer: CustomerHealthCard })` — consumed by Task 9's `/customers` page.

Before writing the CSS value, locate the active dataviz skill's `references/palette.md` and read its "Status palette" table directly — this project has twice already shipped a color value from memory that didn't match the source (Phase 3, Tasks 11 and 12, both caught and fixed). Confirm the exact `warning` hex value for BOTH light and dark modes from the table (do not assume light and dark use the same hex just because `good`'s light/dark values happen to match in this file already — `critical`'s light/dark values differ, so check `warning` specifically rather than assuming either pattern).

- [ ] **Step 1: Add `--status-warning` to globals.css**

Read `palette.md`'s Status palette table for the exact `warning` hex (light and dark). Add `--status-warning` as a new line immediately after the existing `--status-good`/`--status-critical` pair in all three blocks this file already has for status colors (light `:root`, the `@media (prefers-color-scheme: dark)` block, and the `:root[data-theme="dark"]` block) — do not restructure the existing `--status-good`/`--status-critical`/other lines in those blocks, only add the one new line to each.

- [ ] **Step 2: Write the failing verification**

This task has no dedicated unit test (it's a presentational component) — verification is `npx tsc --noEmit` plus the manual browser check in Task 9. Proceed directly to implementation.

- [ ] **Step 3: Write the CustomerCard component**

```tsx
// frontend/components/CustomerCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CustomerHealthCard } from "@/lib/types";

const RISK_LABELS: Record<string, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

const RISK_DOT_VAR: Record<string, string> = {
  low: "var(--status-good)",
  medium: "var(--status-warning)",
  high: "var(--status-critical)",
};

export function CustomerCard({ customer }: { customer: CustomerHealthCard }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{customer.company_name}</CardTitle>
        <Badge variant="outline" className="gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: RISK_DOT_VAR[customer.risk_level] ?? "var(--chart-axis-muted)" }}
          />
          {RISK_LABELS[customer.risk_level] ?? customer.risk_level}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-semibold">
          {Math.round(customer.overall_score)}
          <span className="text-sm font-normal text-muted-foreground">/100</span>
        </div>
        <p className="text-sm text-muted-foreground">{customer.recommended_action}</p>
      </CardContent>
    </Card>
  );
}
```

This uses a small colored dot beside the text label (icon + label pairing) rather than a background-tinted badge, per the dataviz skill's rule that status colors "never carry meaning alone" — this sidesteps any background-contrast computation entirely, since the dot's color is purely supplementary to the text, not required for reading the risk level.

- [ ] **Step 4: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/globals.css frontend/components/CustomerCard.tsx
git commit -m "feat(frontend): add status-warning color and CustomerCard component"
```

---

### Task 9: /customers page, final verification

**Files:**
- Create: `frontend/app/customers/page.tsx`

**Interfaces:**
- Consumes: `getCustomerHealthScores` from Task 7; `CustomerCard` from Task 8.

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/customers/page.tsx
import { getCustomerHealthScores } from "@/lib/api";
import { CustomerCard } from "@/components/CustomerCard";

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { customers, total } = await getCustomerHealthScores(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Customer Intelligence</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => (
          <CustomerCard key={c.company_id} customer={c} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <a
          href={`/customers?page=${page - 1}`}
          aria-disabled={page <= 1}
          className={`text-sm underline ${page <= 1 ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          ← Previous
        </a>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <a
          href={`/customers?page=${page + 1}`}
          aria-disabled={page >= totalPages}
          className={`text-sm underline ${page >= totalPages ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          Next →
        </a>
      </div>
    </main>
  );
}
```

Note: Next.js 15's App Router passes `searchParams` as a `Promise` (must be `await`ed) — this is the correct Next 15 pattern, not a mistake; do not "simplify" it to a plain object.

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors — should be fully clean.

- [ ] **Step 3: Manual verification against the real backend**

With the Encore backend running (`cd backend && encore run`) and the frontend pointed at it, briefly start the frontend (per this project's established convention — never a long-running `next dev` session) and confirm:
- The grid renders real company names, health scores, risk badges (with a visibly-colored dot per risk level), and recommended-action text
- Pagination links work (`/customers?page=2` shows different companies; "Previous" is disabled/inert on page 1)
- No churned companies appear (spot-check a couple of company names against the `/customers` table view from Phase 1's dashboard if useful)
- Since this involves reading actual rendered pixel colors (the risk dot), use a real browser render (e.g. a headless-browser screenshot after hydration), not just `curl` — Recharts/CSS-based visual elements don't reliably show up in raw HTML/SSR-only checks, per prior phases' experience.

- [ ] **Step 4: Run the full backend suite one more time**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions.

- [ ] **Step 5: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/customers/page.tsx
git commit -m "feat(frontend): add /customers page with paginated health-score cards"
git push origin main
```

---
