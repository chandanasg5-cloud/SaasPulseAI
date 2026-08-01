# SaaSPulse AI — Phase 5: Customer Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group active companies into 4 fixed personas via real k-means clustering (scikit-learn, via a new `ml-service` endpoint), with deterministic TypeScript business logic (labeling, confidence, driver attribution) kept outside the ML boundary, persisted into the existing `ml_predictions` table, and displayed on a new `/segments` page.

**Architecture:** Encore computes a 5-dimensional feature vector per active company (Phase 4's 4 sub-scores + a new seat-penetration score), POSTs it to `ml-service`'s new `POST /cluster` (scikit-learn `KMeans`, k=4 fixed, seeded), then runs pure TypeScript functions on the returned assignments/centroids to assign human-readable persona labels, per-company confidence/distance, and driver attribution — all persisted to `ml_predictions` via an `ensureSegmented()` idempotent orchestrator mirroring Phase 1's `ensureSeeded()`.

**Tech Stack:** Encore.ts backend, scikit-learn/FastAPI ml-service, Next.js 15 frontend, vitest, pytest.

## Global Constraints

- Active companies only — same churn-exclusion filter as Phase 4:
  `WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)`.
- Feature vector is exactly `[usage_score, adoption_score, support_score, revenue_score, seat_penetration_score]`,
  all 0–25. The first 4 reuse Phase 4's existing pure functions verbatim — no redefinition.
- k-means: always `KMeans(n_clusters=4, random_state=42, n_init=10)` in production. The k=3..6 silhouette
  evaluation is logged only, never exposed via API, never changes which k is used.
- Fixed persona set and order, always: **Power Users**, **Expansion Opportunity**,
  **High Value, Low Engagement**, **At Risk**. API responses return segments in this exact order,
  never sorted by count.
- No new migration. Persist into the existing `ml_predictions` table only
  (`prediction_type='segment'`, `segment_label`, `model_version='kmeans-v1'`, everything else inside
  the existing `main_drivers` JSONB column).
- No mocking. Backend tests that exercise segmentation call the REAL running `ml-service` over HTTP
  (`ML_SERVICE_URL` env var, default `http://localhost:8001`) — same zero-mocking convention as every
  prior phase. `encore test` now requires Docker/Postgres AND a locally running `ml-service`.
- `ensureSegmented()` must mirror `ensureSeeded()`/`ensureMarketingSpendSeeded()`'s exact idempotency
  pattern: an in-process memoized promise wrapping a DB-level `COUNT(*) > 0` guard, with the underlying
  `doSegment()` function separately exported so tests can exercise the DB-level guard directly.

---

## File Structure

**Backend (`backend/platform/`):**
- `metrics/activeUsers.ts` (new) — shared trailing-30-day active-user counting, extracted from `usageScore.ts`
- `metrics/usageScore.ts` (modify) — refactored to call the shared helper, no behavior change
- `metrics/seatPenetrationScore.ts` (new) — 5th feature: org-wide adoption depth
- `metrics/segmentLabel.ts` (new) — centroid → persona name rule table
- `metrics/clusterConfidence.ts` (new) — per-company distance/confidence
- `metrics/segmentDrivers.ts` (new) — per-company primary/secondary driver attribution
- `mlClient.ts` (new) — HTTP client for `ml-service`'s `/cluster` endpoint
- `segmentation.ts` (new) — `ensureSegmented()` orchestrator, persists to `ml_predictions`
- `api.ts` (modify) — new `customerSegments` endpoint, `GET /customers/segments`

**ml-service (`ml-service/`):**
- `main.py` (modify) — new `POST /cluster` endpoint
- `requirements.txt` (modify) — add `scikit-learn`
- `test_main.py` (modify) — pytest coverage for `/cluster`

**Frontend (`frontend/`):**
- `lib/types.ts` (modify) — `SegmentSummary`, `SegmentsResponse`
- `lib/api.ts` (modify) — `getCustomerSegments()`
- `components/SegmentCard.tsx` (new)
- `app/segments/page.tsx` (new)

---

### Task 1: Shared active-user helper, usageScore refactor, seat-penetration score

**Files:**
- Create: `backend/platform/metrics/activeUsers.ts`
- Create: `backend/platform/metrics/activeUsers.test.ts`
- Create: `backend/platform/metrics/seatPenetrationScore.ts`
- Create: `backend/platform/metrics/seatPenetrationScore.test.ts`
- Modify: `backend/platform/metrics/usageScore.ts`

**Interfaces:**
- Consumes: `ProductEventRow`, `UserRow` from `./types` (both already exist).
- Produces: `countActiveUsers(companyUsers: UserRow[], companyEvents: ProductEventRow[], now: Date): number`
  — consumed by both `usageScore.ts` and this task's `seatPenetrationScore.ts`.
  `computeSeatPenetrationScore(companyUsers: UserRow[], companyEvents: ProductEventRow[], companySize: number,
  now: Date): number` — consumed by Task 7.

This task does double duty: it extracts shared logic out of an already-shipped function (so a second,
independently-written "active user" definition never has the chance to quietly drift from the first) and
uses that same shared logic to build the new 5th feature. `usageScore.ts`'s existing test file
(`usageScore.test.ts`) must NOT be modified — it is the regression proof that the refactor doesn't change
behavior.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/metrics/activeUsers.test.ts
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
```

```typescript
// backend/platform/metrics/seatPenetrationScore.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test metrics/activeUsers.test.ts metrics/seatPenetrationScore.test.ts`
Expected: FAIL — `activeUsers` and `seatPenetrationScore` modules not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/activeUsers.ts
import type { ProductEventRow, UserRow } from "./types";

export function countActiveUsers(companyUsers: UserRow[], companyEvents: ProductEventRow[], now: Date): number {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const activeUserIds = new Set<string>();
  for (const e of companyEvents) {
    if (e.timestamp >= windowStart) activeUserIds.add(e.user_id);
  }
  return companyUsers.filter((u) => activeUserIds.has(u.id)).length;
}
```

```typescript
// backend/platform/metrics/seatPenetrationScore.ts
import type { ProductEventRow, UserRow } from "./types";
import { countActiveUsers } from "./activeUsers";

export function computeSeatPenetrationScore(
  companyUsers: UserRow[],
  companyEvents: ProductEventRow[],
  companySize: number,
  now: Date,
): number {
  if (companySize <= 0) return 0;
  const activeCount = countActiveUsers(companyUsers, companyEvents, now);
  return Math.max(0, Math.min(25, (activeCount / companySize) * 25));
}
```

Replace the full contents of `backend/platform/metrics/usageScore.ts` with:

```typescript
import type { ProductEventRow, UserRow } from "./types";
import { countActiveUsers } from "./activeUsers";

export function computeUsageScore(
  companyUsers: UserRow[],
  companyEvents: ProductEventRow[],
  now: Date,
): number {
  if (companyUsers.length === 0) return 0;
  const activeCount = countActiveUsers(companyUsers, companyEvents, now);
  return (activeCount / companyUsers.length) * 25;
}
```

- [ ] **Step 4: Run tests to verify they pass — including the untouched regression suite**

Run: `cd backend && encore test metrics/activeUsers.test.ts metrics/seatPenetrationScore.test.ts metrics/usageScore.test.ts`
Expected: PASS, all tests — `usageScore.test.ts`'s 3 existing tests must pass unchanged, proving the
refactor didn't alter `computeUsageScore`'s behavior.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/activeUsers.ts backend/platform/metrics/activeUsers.test.ts \
  backend/platform/metrics/seatPenetrationScore.ts backend/platform/metrics/seatPenetrationScore.test.ts \
  backend/platform/metrics/usageScore.ts
git commit -m "feat(backend): extract shared active-user helper, add seat penetration score"
```

---

### Task 2: Deterministic persona labeling

**Files:**
- Create: `backend/platform/metrics/segmentLabel.ts`
- Create: `backend/platform/metrics/segmentLabel.test.ts`

**Interfaces:**
- Produces: `SegmentCentroid` type, `computeSegmentLabels(centroids: SegmentCentroid[]): Map<number, string>`
  — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/platform/metrics/segmentLabel.test.ts
import { describe, it, expect } from "vitest";
import { computeSegmentLabels, type SegmentCentroid } from "./segmentLabel";

describe("computeSegmentLabels", () => {
  const centroids: SegmentCentroid[] = [
    { cluster_id: 0, usage_score: 23, adoption_score: 22, support_score: 20, revenue_score: 21, seat_penetration_score: 22 },
    { cluster_id: 1, usage_score: 5, adoption_score: 5, support_score: 8, revenue_score: 5, seat_penetration_score: 5 },
    { cluster_id: 2, usage_score: 6, adoption_score: 6, support_score: 14, revenue_score: 24, seat_penetration_score: 6 },
    { cluster_id: 3, usage_score: 20, adoption_score: 19, support_score: 14, revenue_score: 7, seat_penetration_score: 19 },
  ];

  it("assigns all 4 fixed personas correctly", () => {
    const labels = computeSegmentLabels(centroids);
    expect(labels.get(0)).toBe("Power Users");
    expect(labels.get(1)).toBe("At Risk");
    expect(labels.get(2)).toBe("High Value, Low Engagement");
    expect(labels.get(3)).toBe("Expansion Opportunity");
  });

  it("tie-breaks equal revenue-engagement gaps by higher raw revenue_score", () => {
    const tiedCentroids: SegmentCentroid[] = [
      { cluster_id: 0, usage_score: 23, adoption_score: 22, support_score: 20, revenue_score: 21, seat_penetration_score: 22 },
      { cluster_id: 1, usage_score: 5, adoption_score: 5, support_score: 8, revenue_score: 5, seat_penetration_score: 5 },
      { cluster_id: 2, usage_score: 12, adoption_score: 12, support_score: 12, revenue_score: 16, seat_penetration_score: 12 },
      { cluster_id: 3, usage_score: 11, adoption_score: 11, support_score: 12, revenue_score: 15, seat_penetration_score: 11 },
    ];
    // cluster 2's gap: 16 - (12+12+12)/3 = 4. cluster 3's gap: 15 - (11+11+11)/3 = 4. Tied.
    // Tie-break: higher raw revenue_score (16 > 15) -> cluster 2 becomes "High Value, Low Engagement".
    const labels = computeSegmentLabels(tiedCentroids);
    expect(labels.get(2)).toBe("High Value, Low Engagement");
    expect(labels.get(3)).toBe("Expansion Opportunity");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test metrics/segmentLabel.test.ts`
Expected: FAIL — `./segmentLabel` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/segmentLabel.ts
export interface SegmentCentroid {
  cluster_id: number;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

function overallScore(c: SegmentCentroid): number {
  return c.usage_score + c.adoption_score + c.support_score + c.revenue_score + c.seat_penetration_score;
}

function revenueEngagementGap(c: SegmentCentroid): number {
  return c.revenue_score - (c.usage_score + c.adoption_score + c.seat_penetration_score) / 3;
}

/** Assumes exactly 4 centroids, matching this project's fixed k=4 production configuration. */
export function computeSegmentLabels(centroids: SegmentCentroid[]): Map<number, string> {
  const sorted = [...centroids].sort((a, b) => overallScore(b) - overallScore(a));
  const [powerUsers, midA, midB, atRisk] = sorted;

  const labels = new Map<number, string>();
  labels.set(powerUsers.cluster_id, "Power Users");
  labels.set(atRisk.cluster_id, "At Risk");

  const gapA = revenueEngagementGap(midA);
  const gapB = revenueEngagementGap(midB);
  const highValue =
    gapA > gapB ? midA : gapB > gapA ? midB : midA.revenue_score >= midB.revenue_score ? midA : midB;
  const expansion = highValue === midA ? midB : midA;

  labels.set(highValue.cluster_id, "High Value, Low Engagement");
  labels.set(expansion.cluster_id, "Expansion Opportunity");

  return labels;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test metrics/segmentLabel.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/segmentLabel.ts backend/platform/metrics/segmentLabel.test.ts
git commit -m "feat(backend): add deterministic segment persona labeling"
```

---

### Task 3: Per-company distance and cluster confidence

**Files:**
- Create: `backend/platform/metrics/clusterConfidence.ts`
- Create: `backend/platform/metrics/clusterConfidence.test.ts`

**Interfaces:**
- Produces: `CentroidWithId` type, `DistanceAndConfidence` type,
  `computeDistanceAndConfidence(companyVector: number[], ownClusterId: number, allCentroids: CentroidWithId[]):
  DistanceAndConfidence` — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/platform/metrics/clusterConfidence.test.ts
import { describe, it, expect } from "vitest";
import { computeDistanceAndConfidence, type CentroidWithId } from "./clusterConfidence";

describe("computeDistanceAndConfidence", () => {
  const centroids: CentroidWithId[] = [
    { cluster_id: 0, vector: [0, 0, 0, 0, 0] },
    { cluster_id: 1, vector: [10, 10, 10, 10, 10] },
  ];

  it("returns distance 0 and confidence 1 when the company sits exactly on its own centroid", () => {
    const result = computeDistanceAndConfidence([0, 0, 0, 0, 0], 0, centroids);
    expect(result.distance_to_centroid).toBe(0);
    expect(result.cluster_confidence).toBe(1);
  });

  it("returns confidence near 0 when equidistant between own and second-nearest centroid", () => {
    const midpoint = [5, 5, 5, 5, 5];
    const result = computeDistanceAndConfidence(midpoint, 0, centroids);
    expect(result.cluster_confidence).toBeCloseTo(0, 5);
  });

  it("computes Euclidean distance correctly", () => {
    const result = computeDistanceAndConfidence([3, 4, 0, 0, 0], 0, centroids);
    // sqrt(3^2 + 4^2) = 5
    expect(result.distance_to_centroid).toBeCloseTo(5, 5);
  });

  it("clamps confidence to 0 when the second-nearest centroid distance is 0 (degenerate case)", () => {
    const degenerate: CentroidWithId[] = [
      { cluster_id: 0, vector: [0, 0, 0, 0, 0] },
      { cluster_id: 1, vector: [5, 0, 0, 0, 0] },
    ];
    const result = computeDistanceAndConfidence([5, 0, 0, 0, 0], 0, degenerate);
    expect(result.cluster_confidence).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test metrics/clusterConfidence.test.ts`
Expected: FAIL — `./clusterConfidence` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/clusterConfidence.ts
export interface CentroidWithId {
  cluster_id: number;
  vector: number[];
}

export interface DistanceAndConfidence {
  distance_to_centroid: number;
  cluster_confidence: number;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
}

/**
 * cluster_confidence is a margin-based score: how much closer the company is to its own
 * centroid than to the nearest other centroid, normalized to [0, 1]. A company sitting on
 * its centroid with the next-nearest cluster far away scores near 1; a company nearly
 * equidistant between two clusters (an ambiguous assignment) scores near 0.
 */
export function computeDistanceAndConfidence(
  companyVector: number[],
  ownClusterId: number,
  allCentroids: CentroidWithId[],
): DistanceAndConfidence {
  const own = allCentroids.find((c) => c.cluster_id === ownClusterId);
  if (!own) throw new Error(`No centroid found for cluster_id ${ownClusterId}`);
  const distanceToOwn = euclideanDistance(companyVector, own.vector);

  let distanceToSecondNearest = Infinity;
  for (const centroid of allCentroids) {
    if (centroid.cluster_id === ownClusterId) continue;
    const d = euclideanDistance(companyVector, centroid.vector);
    if (d < distanceToSecondNearest) distanceToSecondNearest = d;
  }

  const confidence =
    distanceToSecondNearest === 0
      ? 0
      : Math.max(0, Math.min(1, (distanceToSecondNearest - distanceToOwn) / distanceToSecondNearest));

  return { distance_to_centroid: distanceToOwn, cluster_confidence: confidence };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test metrics/clusterConfidence.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/clusterConfidence.ts backend/platform/metrics/clusterConfidence.test.ts
git commit -m "feat(backend): add per-company cluster distance and confidence"
```

---

### Task 4: Segment driver attribution

**Files:**
- Create: `backend/platform/metrics/segmentDrivers.ts`
- Create: `backend/platform/metrics/segmentDrivers.test.ts`

**Interfaces:**
- Produces: `ScoreVector` type, `SegmentDrivers` type,
  `computeSegmentDrivers(companyScores: ScoreVector, populationAverages: ScoreVector): SegmentDrivers`
  — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/platform/metrics/segmentDrivers.test.ts
import { describe, it, expect } from "vitest";
import { computeSegmentDrivers, type ScoreVector } from "./segmentDrivers";

describe("computeSegmentDrivers", () => {
  const populationAverages: ScoreVector = {
    usage_score: 15,
    adoption_score: 15,
    support_score: 15,
    revenue_score: 15,
    seat_penetration_score: 15,
  };

  it("picks the two largest positive deviations as primary/secondary drivers", () => {
    const companyScores: ScoreVector = {
      usage_score: 23, // +8
      adoption_score: 20, // +5
      support_score: 16, // +1
      revenue_score: 14, // -1
      seat_penetration_score: 12, // -3
    };
    const result = computeSegmentDrivers(companyScores, populationAverages);
    expect(result.primary_driver).toBe("High Product Usage");
    expect(result.secondary_driver).toBe("Strong Feature Adoption");
  });

  it("tie-breaks equal deviations by fixed order usage > adoption > support > revenue > seat_penetration", () => {
    const companyScores: ScoreVector = {
      usage_score: 15, // +0
      adoption_score: 15, // +0
      support_score: 20, // +5
      revenue_score: 20, // +5 (tied with support)
      seat_penetration_score: 10, // -5
    };
    const result = computeSegmentDrivers(companyScores, populationAverages);
    expect(result.primary_driver).toBe("Low Support Burden");
    expect(result.secondary_driver).toBe("High Plan Value");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test metrics/segmentDrivers.test.ts`
Expected: FAIL — `./segmentDrivers` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/segmentDrivers.ts
export interface ScoreVector {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

type ScoreKey = keyof ScoreVector;

const DRIVER_ORDER: ScoreKey[] = [
  "usage_score", "adoption_score", "support_score", "revenue_score", "seat_penetration_score",
];

const DRIVER_LABELS: Record<ScoreKey, string> = {
  usage_score: "High Product Usage",
  adoption_score: "Strong Feature Adoption",
  support_score: "Low Support Burden",
  revenue_score: "High Plan Value",
  seat_penetration_score: "Deep Organizational Adoption",
};

export interface SegmentDrivers {
  primary_driver: string;
  secondary_driver: string;
}

export function computeSegmentDrivers(companyScores: ScoreVector, populationAverages: ScoreVector): SegmentDrivers {
  const deviations = DRIVER_ORDER.map((key) => ({
    key,
    deviation: companyScores[key] - populationAverages[key],
  }));

  deviations.sort((a, b) => {
    if (b.deviation !== a.deviation) return b.deviation - a.deviation;
    return DRIVER_ORDER.indexOf(a.key) - DRIVER_ORDER.indexOf(b.key);
  });

  return {
    primary_driver: DRIVER_LABELS[deviations[0].key],
    secondary_driver: DRIVER_LABELS[deviations[1].key],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test metrics/segmentDrivers.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/segmentDrivers.ts backend/platform/metrics/segmentDrivers.test.ts
git commit -m "feat(backend): add segment driver attribution"
```

---

### Task 5: ml-service `/cluster` endpoint

**Files:**
- Modify: `ml-service/main.py`
- Modify: `ml-service/requirements.txt`
- Modify: `ml-service/test_main.py`

**Interfaces:**
- Produces: `POST /cluster` — request `{ companies: [{ company_id, usage_score, adoption_score,
  support_score, revenue_score, seat_penetration_score }] }`, response `{ assignments: [{ company_id,
  cluster_id }], centroids: [{ cluster_id, usage_score, adoption_score, support_score, revenue_score,
  seat_penetration_score }], metadata: { algorithm, algorithm_version, random_seed, generated_at } }`
  — consumed by Task 6.

- [ ] **Step 1: Add scikit-learn to requirements.txt**

Replace the full contents of `ml-service/requirements.txt` with:

```
fastapi==0.115.0
uvicorn==0.30.6
httpx==0.27.2
pytest==8.3.3
scikit-learn==1.5.2
```

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pip install -r requirements.txt`
Expected: installs `scikit-learn` and its transitive deps (`numpy`, `scipy`, `joblib`, `threadpoolctl`)
into the existing venv without error.

- [ ] **Step 2: Write the failing tests**

Append to `ml-service/test_main.py` (keep the existing `test_health` test as-is):

```python
def _company(company_id, usage, adoption, support, revenue, seat):
    return {
        "company_id": company_id,
        "usage_score": usage,
        "adoption_score": adoption,
        "support_score": support,
        "revenue_score": revenue,
        "seat_penetration_score": seat,
    }


FIXTURE_COMPANIES = [
    _company("CMP-A1", 24, 23, 20, 22, 23),
    _company("CMP-A2", 23, 22, 19, 23, 22),
    _company("CMP-B1", 4, 3, 22, 5, 4),
    _company("CMP-B2", 3, 4, 21, 4, 3),
    _company("CMP-C1", 22, 20, 15, 6, 21),
    _company("CMP-C2", 21, 21, 14, 5, 20),
    _company("CMP-D1", 5, 4, 12, 24, 5),
    _company("CMP-D2", 4, 5, 13, 23, 4),
]


def test_cluster_returns_four_clusters_with_full_assignment():
    response = client.post("/cluster", json={"companies": FIXTURE_COMPANIES})
    assert response.status_code == 200
    body = response.json()

    assert len(body["centroids"]) == 4
    assignment_ids = {a["company_id"] for a in body["assignments"]}
    assert assignment_ids == {c["company_id"] for c in FIXTURE_COMPANIES}
    assert len(body["assignments"]) == len(FIXTURE_COMPANIES)

    cluster_ids_used = {a["cluster_id"] for a in body["assignments"]}
    assert cluster_ids_used == {0, 1, 2, 3}


def test_cluster_metadata():
    response = client.post("/cluster", json={"companies": FIXTURE_COMPANIES})
    metadata = response.json()["metadata"]
    assert metadata["algorithm"] == "kmeans"
    assert metadata["random_seed"] == 42
    assert metadata["algorithm_version"]
    assert metadata["generated_at"]


def test_cluster_is_deterministic_across_calls():
    first = client.post("/cluster", json={"companies": FIXTURE_COMPANIES}).json()
    second = client.post("/cluster", json={"companies": FIXTURE_COMPANIES}).json()

    first_map = {a["company_id"]: a["cluster_id"] for a in first["assignments"]}
    second_map = {a["company_id"]: a["cluster_id"] for a in second["assignments"]}
    assert first_map == second_map
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: the 3 new tests FAIL with a 404 (no `/cluster` route yet); `test_health` still passes.

- [ ] **Step 4: Implement**

Replace the full contents of `ml-service/main.py` with:

```python
import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

app = FastAPI(title="SaaSPulse AI ML Service")
logger = logging.getLogger("segmentation")

FEATURE_KEYS = ["usage_score", "adoption_score", "support_score", "revenue_score", "seat_penetration_score"]
RANDOM_SEED = 42
N_CLUSTERS = 4


class CompanyFeatures(BaseModel):
    company_id: str
    usage_score: float
    adoption_score: float
    support_score: float
    revenue_score: float
    seat_penetration_score: float


class ClusterRequest(BaseModel):
    companies: list[CompanyFeatures]


class Assignment(BaseModel):
    company_id: str
    cluster_id: int


class Centroid(BaseModel):
    cluster_id: int
    usage_score: float
    adoption_score: float
    support_score: float
    revenue_score: float
    seat_penetration_score: float


class ClusterMetadata(BaseModel):
    algorithm: str
    algorithm_version: str
    random_seed: int
    generated_at: str


class ClusterResponse(BaseModel):
    assignments: list[Assignment]
    centroids: list[Centroid]
    metadata: ClusterMetadata


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/cluster")
def cluster(request: ClusterRequest) -> ClusterResponse:
    companies = request.companies
    vectors = [[getattr(c, key) for key in FEATURE_KEYS] for c in companies]

    _log_silhouette_scores(vectors)

    model = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_SEED, n_init=10)
    labels = model.fit_predict(vectors)

    assignments = [
        Assignment(company_id=c.company_id, cluster_id=int(label))
        for c, label in zip(companies, labels)
    ]
    centroids = [
        Centroid(
            cluster_id=i,
            usage_score=float(center[0]),
            adoption_score=float(center[1]),
            support_score=float(center[2]),
            revenue_score=float(center[3]),
            seat_penetration_score=float(center[4]),
        )
        for i, center in enumerate(model.cluster_centers_)
    ]
    metadata = ClusterMetadata(
        algorithm="kmeans",
        algorithm_version="v1",
        random_seed=RANDOM_SEED,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    return ClusterResponse(assignments=assignments, centroids=centroids, metadata=metadata)


def _log_silhouette_scores(vectors: list[list[float]]) -> None:
    """Observability only: logs candidate-k silhouette scores. Never changes N_CLUSTERS,
    never exposed via the API — this project's persona set is a fixed product decision,
    not something recomputed per run."""
    for k in (3, 4, 5, 6):
        if len(vectors) <= k:
            continue
        candidate = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10)
        candidate_labels = candidate.fit_predict(vectors)
        score = silhouette_score(vectors, candidate_labels)
        logger.info("silhouette k=%d score=%.4f", k, score)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: PASS, all tests (`test_health` plus the 3 new `/cluster` tests).

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add ml-service/main.py ml-service/requirements.txt ml-service/test_main.py
git commit -m "feat(ml-service): add /cluster endpoint using scikit-learn KMeans"
```

---

### Task 6: Backend ml-service HTTP client

**Files:**
- Create: `backend/platform/mlClient.ts`
- Create: `backend/platform/mlClient.test.ts`

**Interfaces:**
- Consumes: Task 5's `POST /cluster` over HTTP.
- Produces: `ClusterRequestCompany`, `ClusterAssignment`, `ClusterCentroid`, `ClusterMetadata`,
  `ClusterResponse` types; `callClusterService(companies: ClusterRequestCompany[]): Promise<ClusterResponse>`
  — consumed by Task 7.

This is the project's first backend test that requires a second live service. No mocking — the test
calls the real `ml-service` over HTTP, per this project's established convention.

**Before running this task's tests**, start `ml-service` in the background:

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service"
.venv/bin/uvicorn main:app --port 8001 > /tmp/ml-service.log 2>&1 &
echo $! > /tmp/ml-service.pid
```

Verify it's up: `curl -s http://127.0.0.1:8001/health` should return `{"status":"ok"}`.
After this task's tests pass, stop it: `kill $(cat /tmp/ml-service.pid)`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/platform/mlClient.test.ts
import { describe, it, expect } from "vitest";
import { callClusterService } from "./mlClient";

describe("callClusterService", () => {
  it("calls the real ml-service and returns assignments, centroids, and metadata", async () => {
    const companies = [
      { company_id: "T-A1", usage_score: 24, adoption_score: 23, support_score: 20, revenue_score: 22, seat_penetration_score: 23 },
      { company_id: "T-A2", usage_score: 23, adoption_score: 22, support_score: 19, revenue_score: 23, seat_penetration_score: 22 },
      { company_id: "T-B1", usage_score: 4, adoption_score: 3, support_score: 22, revenue_score: 5, seat_penetration_score: 4 },
      { company_id: "T-B2", usage_score: 3, adoption_score: 4, support_score: 21, revenue_score: 4, seat_penetration_score: 3 },
      { company_id: "T-C1", usage_score: 22, adoption_score: 20, support_score: 15, revenue_score: 6, seat_penetration_score: 21 },
      { company_id: "T-C2", usage_score: 21, adoption_score: 21, support_score: 14, revenue_score: 5, seat_penetration_score: 20 },
      { company_id: "T-D1", usage_score: 5, adoption_score: 4, support_score: 12, revenue_score: 24, seat_penetration_score: 5 },
      { company_id: "T-D2", usage_score: 4, adoption_score: 5, support_score: 13, revenue_score: 23, seat_penetration_score: 4 },
    ];

    const result = await callClusterService(companies);

    expect(result.assignments).toHaveLength(8);
    expect(new Set(result.assignments.map((a) => a.company_id))).toEqual(
      new Set(companies.map((c) => c.company_id)),
    );
    expect(result.centroids).toHaveLength(4);
    for (const centroid of result.centroids) {
      expect(typeof centroid.usage_score).toBe("number");
      expect(typeof centroid.adoption_score).toBe("number");
      expect(typeof centroid.support_score).toBe("number");
      expect(typeof centroid.revenue_score).toBe("number");
      expect(typeof centroid.seat_penetration_score).toBe("number");
    }
    expect(result.metadata.algorithm).toBe("kmeans");
    expect(result.metadata.random_seed).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test mlClient.test.ts`
Expected: FAIL — `./mlClient` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/mlClient.ts
export interface ClusterRequestCompany {
  company_id: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

export interface ClusterAssignment {
  company_id: string;
  cluster_id: number;
}

export interface ClusterCentroid {
  cluster_id: number;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

export interface ClusterMetadata {
  algorithm: string;
  algorithm_version: string;
  random_seed: number;
  generated_at: string;
}

export interface ClusterResponse {
  assignments: ClusterAssignment[];
  centroids: ClusterCentroid[];
  metadata: ClusterMetadata;
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8001";

export async function callClusterService(companies: ClusterRequestCompany[]): Promise<ClusterResponse> {
  const res = await fetch(`${ML_SERVICE_URL}/cluster`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
  });
  if (!res.ok) throw new Error(`POST ${ML_SERVICE_URL}/cluster failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test mlClient.test.ts`
Expected: PASS. (Requires `ml-service` running on port 8001 — see setup above.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/mlClient.ts backend/platform/mlClient.test.ts
git commit -m "feat(backend): add ml-service HTTP client for cluster requests"
```

---

### Task 7: Segmentation orchestrator — `ensureSegmented()`

**Files:**
- Create: `backend/platform/segmentation.ts`
- Create: `backend/platform/segmentation.test.ts`

**Interfaces:**
- Consumes: `ensureSeeded` from `./seed`; `computeUsageScore` from `./metrics/usageScore`;
  `computeFeatureAdoptionScore` from `./metrics/featureAdoptionScore`; `computeSupportScore` from
  `./metrics/supportScore`; `computeRevenueScore` from `./metrics/revenueScore`;
  `computeSeatPenetrationScore` from `./metrics/seatPenetrationScore` (Task 1);
  `computeSegmentLabels`, `SegmentCentroid` from `./metrics/segmentLabel` (Task 2);
  `computeDistanceAndConfidence`, `CentroidWithId` from `./metrics/clusterConfidence` (Task 3);
  `computeSegmentDrivers`, `ScoreVector` from `./metrics/segmentDrivers` (Task 4);
  `callClusterService`, `ClusterRequestCompany` from `./mlClient` (Task 6);
  `CompanyEventRow`, `SupportTicketRow`, `UserRow`, `ProductEventRow` from `./metrics/types`.
- Produces: `ensureSegmented(): Promise<void>`, `doSegment(): Promise<void>` — consumed by Task 8.

**Before running this task's tests**, `ml-service` must be running on port 8001 (same setup as Task 6).

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/segmentation.test.ts
import { describe, it, expect } from "vitest";
import { ensureSegmented, doSegment } from "./segmentation";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("ensureSegmented", () => {
  it("persists one segment row per active company with all fields populated", async () => {
    await ensureSeeded();
    await ensureSegmented();

    const activeCountRow = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
    `;
    const segmentCountRow = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'
    `;
    expect(segmentCountRow?.n).toBe(activeCountRow?.n);

    const sample = await db.queryRow<{ segment_label: string; main_drivers: string }>`
      SELECT segment_label, main_drivers::text AS main_drivers
      FROM ml_predictions WHERE prediction_type = 'segment' LIMIT 1
    `;
    expect(sample?.segment_label).toBeTruthy();
    const drivers = JSON.parse(sample!.main_drivers);
    expect(typeof drivers.cluster_confidence).toBe("number");
    expect(drivers.cluster_confidence).toBeGreaterThanOrEqual(0);
    expect(drivers.cluster_confidence).toBeLessThanOrEqual(1);
    expect(typeof drivers.distance_to_centroid).toBe("number");
    expect(drivers.distance_to_centroid).toBeGreaterThanOrEqual(0);
    expect(typeof drivers.primary_driver).toBe("string");
    expect(typeof drivers.secondary_driver).toBe("string");
  });

  it("only ever produces the 4 fixed persona labels", async () => {
    await ensureSegmented();
    const rows = db.query<{ segment_label: string }>`
      SELECT DISTINCT segment_label FROM ml_predictions WHERE prediction_type = 'segment'
    `;
    const labels: string[] = [];
    for await (const r of rows) labels.push(r.segment_label);
    for (const label of labels) {
      expect(["Power Users", "Expansion Opportunity", "High Value, Low Engagement", "At Risk"]).toContain(label);
    }
  });

  it("is idempotent — a second call does not duplicate rows", async () => {
    await ensureSegmented();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    await ensureSegmented();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    expect(after?.n).toBe(before?.n);
  });

  it("doSegment's DB-level guard prevents reseeding when called directly a second time", async () => {
    await ensureSegmented();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    await doSegment();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    expect(after?.n).toBe(before?.n);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test segmentation.test.ts`
Expected: FAIL — `./segmentation` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/segmentation.ts
import { db } from "./db";
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeSeatPenetrationScore } from "./metrics/seatPenetrationScore";
import { computeSegmentLabels, type SegmentCentroid } from "./metrics/segmentLabel";
import { computeDistanceAndConfidence, type CentroidWithId } from "./metrics/clusterConfidence";
import { computeSegmentDrivers, type ScoreVector } from "./metrics/segmentDrivers";
import { callClusterService, type ClusterRequestCompany } from "./mlClient";
import type { CompanyEventRow, SupportTicketRow, UserRow, ProductEventRow } from "./metrics/types";
import type { Primitive, SQLDatabase, Transaction } from "encore.dev/storage/sqldb";

type Executor = SQLDatabase | Transaction;

interface SegmentActiveCompanyRow {
  id: string;
  company_size: number;
  plan_name: string;
  status: string;
}

interface CompanyFeatures {
  id: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

let segmented: Promise<void> | null = null;

export function ensureSegmented(): Promise<void> {
  if (!segmented) segmented = doSegment();
  return segmented;
}

export async function doSegment(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
  if (existing && existing.n > 0) return;

  const now = new Date();

  const companies: SegmentActiveCompanyRow[] = [];
  for await (const r of db.query<SegmentActiveCompanyRow>`
    SELECT c.id, c.company_size,
      COALESCE(s.plan_name, 'none') AS plan_name,
      COALESCE(s.status, 'none') AS status
    FROM companies c
    LEFT JOIN subscriptions s ON s.company_id = c.id
    WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
    ORDER BY c.id
  `) {
    companies.push(r);
  }
  if (companies.length === 0) return;

  const users: UserRow[] = [];
  for await (const r of db.query<UserRow>`SELECT id, company_id, first_login_at, created_at FROM users`) {
    users.push(r);
  }

  const events: CompanyEventRow[] = [];
  for await (const r of db.query<CompanyEventRow>`
    SELECT company_id, user_id, feature_name, "timestamp" FROM product_events
  `) {
    events.push(r);
  }

  const tickets: SupportTicketRow[] = [];
  for await (const r of db.query<SupportTicketRow>`SELECT company_id, priority, created_at FROM support_tickets`) {
    tickets.push(r);
  }

  const usersByCompany = new Map<string, UserRow[]>();
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

  const ticketsByCompany = new Map<string, SupportTicketRow[]>();
  for (const t of tickets) {
    const arr = ticketsByCompany.get(t.company_id) ?? [];
    arr.push(t);
    ticketsByCompany.set(t.company_id, arr);
  }

  const features: CompanyFeatures[] = companies.map((c) => {
    const companyUsers = usersByCompany.get(c.id) ?? [];
    const companyEvents = eventsByCompany.get(c.id) ?? [];
    const companyTickets = ticketsByCompany.get(c.id) ?? [];
    const productEventRows: ProductEventRow[] = companyEvents.map((e) => ({
      user_id: e.user_id,
      feature_name: e.feature_name,
      timestamp: e.timestamp,
    }));

    return {
      id: c.id,
      usage_score: computeUsageScore(companyUsers, productEventRows, now),
      adoption_score: computeFeatureAdoptionScore(productEventRows, now),
      support_score: computeSupportScore(companyTickets, now),
      revenue_score: computeRevenueScore({ plan_name: c.plan_name, status: c.status }),
      seat_penetration_score: computeSeatPenetrationScore(companyUsers, productEventRows, c.company_size, now),
    };
  });

  const clusterRequest: ClusterRequestCompany[] = features.map((f) => ({
    company_id: f.id,
    usage_score: f.usage_score,
    adoption_score: f.adoption_score,
    support_score: f.support_score,
    revenue_score: f.revenue_score,
    seat_penetration_score: f.seat_penetration_score,
  }));

  const clusterResult = await callClusterService(clusterRequest);
  if (clusterResult.assignments.length !== features.length) {
    throw new Error(
      `ml-service returned ${clusterResult.assignments.length} assignments for ${features.length} companies`,
    );
  }

  const segmentCentroids: SegmentCentroid[] = clusterResult.centroids.map((c) => ({
    cluster_id: c.cluster_id,
    usage_score: c.usage_score,
    adoption_score: c.adoption_score,
    support_score: c.support_score,
    revenue_score: c.revenue_score,
    seat_penetration_score: c.seat_penetration_score,
  }));
  const labels = computeSegmentLabels(segmentCentroids);

  const centroidsWithId: CentroidWithId[] = clusterResult.centroids.map((c) => ({
    cluster_id: c.cluster_id,
    vector: [c.usage_score, c.adoption_score, c.support_score, c.revenue_score, c.seat_penetration_score],
  }));

  const populationAverages: ScoreVector = {
    usage_score: average(features.map((f) => f.usage_score)),
    adoption_score: average(features.map((f) => f.adoption_score)),
    support_score: average(features.map((f) => f.support_score)),
    revenue_score: average(features.map((f) => f.revenue_score)),
    seat_penetration_score: average(features.map((f) => f.seat_penetration_score)),
  };

  const featuresById = new Map(features.map((f) => [f.id, f]));
  const today = now.toISOString().slice(0, 10);
  const columns = [
    "id", "company_id", "prediction_type", "prediction_date",
    "churn_probability", "segment_label", "main_drivers", "recommendation", "model_version",
  ];
  const rows: Primitive[][] = [];

  clusterResult.assignments.forEach((assignment, idx) => {
    const f = featuresById.get(assignment.company_id);
    if (!f) return;
    const companyVector = [f.usage_score, f.adoption_score, f.support_score, f.revenue_score, f.seat_penetration_score];
    const { distance_to_centroid, cluster_confidence } = computeDistanceAndConfidence(
      companyVector,
      assignment.cluster_id,
      centroidsWithId,
    );
    const scoreVector: ScoreVector = {
      usage_score: f.usage_score,
      adoption_score: f.adoption_score,
      support_score: f.support_score,
      revenue_score: f.revenue_score,
      seat_penetration_score: f.seat_penetration_score,
    };
    const drivers = computeSegmentDrivers(scoreVector, populationAverages);
    const segmentLabel = labels.get(assignment.cluster_id) ?? "Unknown";

    const mainDrivers = {
      cluster_id: assignment.cluster_id,
      ...scoreVector,
      distance_to_centroid,
      cluster_confidence,
      primary_driver: drivers.primary_driver,
      secondary_driver: drivers.secondary_driver,
      algorithm: clusterResult.metadata.algorithm,
      algorithm_version: clusterResult.metadata.algorithm_version,
      random_seed: clusterResult.metadata.random_seed,
      generated_at: clusterResult.metadata.generated_at,
    };

    rows.push([
      `SEG-${String(idx + 1).padStart(5, "0")}`,
      assignment.company_id,
      "segment",
      today,
      null,
      segmentLabel,
      JSON.stringify(mainDrivers),
      null,
      "kmeans-v1",
    ]);
  });

  const tx = await db.begin();
  try {
    await batchInsert(tx, columns, rows);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function batchInsert(
  executor: Executor,
  columns: string[],
  rows: Primitive[][],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueClauses: string[] = [];
    const params: Primitive[] = [];
    batch.forEach((row, rowIdx) => {
      const placeholders = row.map((_, colIdx) => `$${rowIdx * row.length + colIdx + 1}`);
      valueClauses.push(`(${placeholders.join(", ")})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ml_predictions (${columns.join(", ")}) VALUES ${valueClauses.join(", ")}`;
    await executor.rawExec(sql, ...params);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test segmentation.test.ts`
Expected: PASS, all 4 tests. (Requires `ml-service` running on port 8001.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/segmentation.ts backend/platform/segmentation.test.ts
git commit -m "feat(backend): add ensureSegmented() orchestrator persisting to ml_predictions"
```

---

### Task 8: `GET /customers/segments` endpoint

**Files:**
- Modify: `backend/platform/api.ts`
- Modify: `backend/platform/api.test.ts`

**Interfaces:**
- Consumes: `ensureSegmented` from `./segmentation` (Task 7).
- Produces: `customerSegments` exported Encore API handler at `GET /customers/segments`.

- [ ] **Step 1: Write the failing test**

Add `customerSegments` to the existing import line at the top of `backend/platform/api.test.ts`
(it currently reads `import { customerHealthScores } from "./api";` — change it to
`import { customerHealthScores, customerSegments } from "./api";`), then append:

```typescript
describe("customerSegments", () => {
  it("returns exactly 4 rows in fixed persona order with counts summing to total active companies", async () => {
    const res = await customerSegments();
    expect(res.segments).toHaveLength(4);
    expect(res.segments.map((s) => s.segment_label)).toEqual([
      "Power Users", "Expansion Opportunity", "High Value, Low Engagement", "At Risk",
    ]);

    const totalCount = res.segments.reduce((sum, s) => sum + s.company_count, 0);
    const activeCompanies = await companiesCount();
    expect(totalCount).toBe(activeCompanies.active_companies);

    const totalPct = res.segments.reduce((sum, s) => sum + s.pct_of_total, 0);
    expect(totalPct).toBeCloseTo(100, 1);
  });
});
```

(`companiesCount` is already imported at the top of `api.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test api.test.ts`
Expected: FAIL — `customerSegments is not a function`.

- [ ] **Step 3: Implement**

Append to the end of `backend/platform/api.ts` (add `import { ensureSegmented } from "./segmentation";`
near the other imports at the top of the file):

```typescript
interface SegmentPredictionRow {
  segment_label: string;
  main_drivers: {
    usage_score: number;
    adoption_score: number;
    support_score: number;
    revenue_score: number;
    seat_penetration_score: number;
  };
}

interface SegmentSummary {
  segment_label: string;
  company_count: number;
  pct_of_total: number;
  avg_usage_score: number;
  avg_adoption_score: number;
  avg_support_score: number;
  avg_revenue_score: number;
  avg_seat_penetration_score: number;
}

const SEGMENT_ORDER = ["Power Users", "Expansion Opportunity", "High Value, Low Engagement", "At Risk"];

function averageMetric(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export const customerSegments = api(
  { method: "GET", path: "/customers/segments", expose: true },
  async (): Promise<{ segments: SegmentSummary[] }> => {
    await ensureSegmented();

    const rows: SegmentPredictionRow[] = [];
    for await (const r of db.query<{ segment_label: string; main_drivers: string }>`
      SELECT segment_label, main_drivers::text AS main_drivers
      FROM ml_predictions
      WHERE prediction_type = 'segment'
    `) {
      rows.push({ segment_label: r.segment_label, main_drivers: JSON.parse(r.main_drivers) });
    }

    const total = rows.length;
    const bySegment = new Map<string, SegmentPredictionRow[]>();
    for (const r of rows) {
      const arr = bySegment.get(r.segment_label) ?? [];
      arr.push(r);
      bySegment.set(r.segment_label, arr);
    }

    const segments: SegmentSummary[] = SEGMENT_ORDER.map((label) => {
      const members = bySegment.get(label) ?? [];
      return {
        segment_label: label,
        company_count: members.length,
        pct_of_total: total === 0 ? 0 : (members.length / total) * 100,
        avg_usage_score: averageMetric(members.map((m) => m.main_drivers.usage_score)),
        avg_adoption_score: averageMetric(members.map((m) => m.main_drivers.adoption_score)),
        avg_support_score: averageMetric(members.map((m) => m.main_drivers.support_score)),
        avg_revenue_score: averageMetric(members.map((m) => m.main_drivers.revenue_score)),
        avg_seat_penetration_score: averageMetric(members.map((m) => m.main_drivers.seat_penetration_score)),
      };
    });

    return { segments };
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test api.test.ts`
Expected: PASS, all tests in the file. (Requires `ml-service` running on port 8001.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): add customers/segments endpoint"
```

---

### Task 9: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

**Interfaces:**
- Produces: `SegmentSummary`, `SegmentsResponse` types; `getCustomerSegments(): Promise<SegmentsResponse>`
  — consumed by Tasks 10-11.

- [ ] **Step 1: Add the response types**

Append to `frontend/lib/types.ts`:

```typescript
export interface SegmentSummary {
  segment_label: string;
  company_count: number;
  pct_of_total: number;
  avg_usage_score: number;
  avg_adoption_score: number;
  avg_support_score: number;
  avg_revenue_score: number;
  avg_seat_penetration_score: number;
}

export interface SegmentsResponse {
  segments: SegmentSummary[];
}
```

- [ ] **Step 2: Add the API client function**

Merge `SegmentsResponse` into the existing type-only import line at the top of `frontend/lib/api.ts`
(it currently reads `import type { CompaniesResponse, ExecutiveOverview, ProductOverview,
CustomerHealthScoresResponse } from "./types";`), then append:

```typescript
export async function getCustomerSegments(): Promise<SegmentsResponse> {
  const res = await fetch(`${API}/customers/segments`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/segments failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): add segments types and API client"
```

---

### Task 10: `SegmentCard` component

**Files:**
- Create: `frontend/components/SegmentCard.tsx`

**Interfaces:**
- Consumes: `SegmentSummary` from `@/lib/types` (Task 9).
- Produces: `SegmentCard({ segment }: { segment: SegmentSummary })` — consumed by Task 11.

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/SegmentCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SegmentSummary } from "@/lib/types";

const SEGMENT_COLOR_VAR: Record<string, string> = {
  "Power Users": "var(--series-1)",
  "Expansion Opportunity": "var(--series-2)",
  "High Value, Low Engagement": "var(--series-3)",
  "At Risk": "var(--series-4)",
};

export function SegmentCard({ segment }: { segment: SegmentSummary }) {
  const color = SEGMENT_COLOR_VAR[segment.segment_label] ?? "var(--chart-axis-muted)";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <CardTitle className="text-base">{segment.segment_label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-semibold">{segment.company_count}</div>
          <p className="text-sm text-muted-foreground">{segment.pct_of_total.toFixed(1)}% of customers</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Usage</dt>
          <dd className="text-right">{segment.avg_usage_score.toFixed(1)}</dd>
          <dt className="text-muted-foreground">Adoption</dt>
          <dd className="text-right">{segment.avg_adoption_score.toFixed(1)}</dd>
          <dt className="text-muted-foreground">Support</dt>
          <dd className="text-right">{segment.avg_support_score.toFixed(1)}</dd>
          <dt className="text-muted-foreground">Revenue</dt>
          <dd className="text-right">{segment.avg_revenue_score.toFixed(1)}</dd>
          <dt className="text-muted-foreground">Seat Penetration</dt>
          <dd className="text-right">{segment.avg_seat_penetration_score.toFixed(1)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
```

This uses one fixed hue per persona (looked up by label, not array position — robust regardless of
response ordering) from the existing categorical `--series-1..4` palette. No new colors, no palette
validation needed — reusing an already-validated palette from Phase 2.

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/components/SegmentCard.tsx
git commit -m "feat(frontend): add SegmentCard component"
```

---

### Task 11: `/segments` page, final verification

**Files:**
- Create: `frontend/app/segments/page.tsx`

**Interfaces:**
- Consumes: `getCustomerSegments` from `@/lib/api` (Task 9); `SegmentCard` from `@/components/SegmentCard`
  (Task 10).

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/segments/page.tsx
import { getCustomerSegments } from "@/lib/api";
import { SegmentCard } from "@/components/SegmentCard";

export default async function SegmentsPage() {
  const { segments } = await getCustomerSegments();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Customer Segmentation</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {segments.map((s) => (
          <SegmentCard key={s.segment_label} segment={s} />
        ))}
      </div>
    </main>
  );
}
```

No pagination — the endpoint always returns exactly 4 rows, unlike `/customers`.

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors — should be fully clean.

- [ ] **Step 3: Manual verification against the real backend and ml-service**

With Docker/Postgres running, `ml-service` running (`cd ml-service && .venv/bin/uvicorn main:app
--port 8001`), and the Encore backend running (`cd backend && encore run`), briefly start the frontend
(per this project's established convention — never a long-running `next dev` session) and confirm:
- The grid renders exactly 4 cards, in this exact order: Power Users, Expansion Opportunity,
  High Value/Low Engagement, At Risk
- Each card shows a real company count, a real percentage, and 5 real average sub-scores
- Each card's colored dot resolves to a different one of `--series-1` through `--series-4`
  (use a real browser render — Playwright-driven Chromium is already available in this project's
  scratchpad from prior phases — to confirm computed `background-color`, not just curl/SSR HTML)
- The 4 `company_count` values sum to the same `active_companies` total `GET /companies/count` reports

- [ ] **Step 4: Run the full test suites one more time**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: all tests pass.

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions. (Requires Docker/Postgres AND `ml-service` on port 8001
both running.)

- [ ] **Step 5: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/segments/page.tsx
git commit -m "feat(frontend): add /segments page with 4 persona cards"
git push origin main
```
