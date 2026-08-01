# SaaSPulse AI — Phase 5: Customer Segmentation (Module 4)

Status: Approved
Date: 2026-07-31

## Goal

Group active companies into 4 fixed, human-interpretable personas via real k-means
clustering, using Phase 4's already-computed sub-scores as the feature vector. This is
the project's first real cross-service ML call: Encore fetches each active company's
feature vector, POSTs it to a new `ml-service` endpoint, which runs scikit-learn
`KMeans` and returns cluster assignments + centroids. Business-meaning labeling
("Power Users" vs "Cluster 2") stays in TypeScript as a pure, unit-tested function —
consistent with this project's established rule that business logic lives in tested
pure functions, not inside the ML boundary.

## Scope Decision: Active Companies Only

Same scope as Phase 4 — segmentation only considers companies whose subscription is
not churned, for the same reason: a churned company isn't a target for a retention/
growth persona. Also means the feature vector (Phase 4's sub-scores) is only ever
computed for a population that already has those scores well-defined.

## Feature Vector

Five features per active company, all normalized to 0–25 (no additional scaling
needed for k-means):

```
[usage_score, adoption_score, support_score, revenue_score, seat_penetration_score]
```

The first four are Phase 4's existing pure functions, called directly (no HTTP
self-call) — `computeUsageScore`, `computeFeatureAdoptionScore`, `computeSupportScore`,
`computeRevenueScore`.

**`seat_penetration_score`** (new, this phase): `companies.company_size` (total
org headcount, already in the schema but unused elsewhere) approximates "seats" since
there's no licensed-seat concept in this data model. Computed as:

```
seat_penetration_score = companySize <= 0
  ? 0
  : clamp(0, 25, (active_users_trailing_30d / companySize) * 25)
```

"Active" must reuse the exact same trailing-30-day, ≥1-product-event user-counting
logic `usageScore.ts` already computes internally — not a second, independently
written definition of "active" that could subtly drift from it. `usageScore.ts`'s
active-count logic should be extracted into a small shared helper (e.g. `countActiveUsers
(companyUsers, companyEvents, now): number` in `backend/platform/metrics/months.ts` or
a new `activeUsers.ts`) that both `usageScore.ts` and the new `seatPenetrationScore.ts`
call — this is the same "no redefinition, no drift" principle Phase 4 already applied
when it reused Phase 3's `computeFeatureAdoptionRate` verbatim rather than
reimplementing it. `company_size <= 0` is defensive only (the schema's `company_size`
is `NOT NULL INTEGER`, and the seed generator always assigns a positive value) — it
guards against a divide-by-zero without asserting the case is expected to occur.

This measures what fraction of the whole organization has adopted the
tool — a different signal from `usage_score` (which only looks at users who already
have product accounts, not total headcount) — and exists specifically to stop
Enterprise customers clustering together purely because they pay more, when their
actual per-employee adoption might be shallow. New pure function:
`backend/platform/metrics/seatPenetrationScore.ts`, `computeSeatPenetrationScore
(companyUsers: UserRow[], companyEvents: ProductEventRow[], companySize: number,
now: Date): number`. DB-free, unit-tested with fixture rows, same pattern as the
other 4 sub-score functions.

## Algorithm Selection

K-means was chosen over DBSCAN/GMM/hierarchical clustering because: all 5 features
are continuous and already normalized to the same scale; the goal is interpretable
personas whose centroids directly represent "what does an average company in this
group look like"; and stable, small-in-number personas are more useful to Product/CS/
exec audiences than maximally flexible cluster shapes. This trades clustering
flexibility for interpretability and business consistency — the right trade for this
product's audience.

## Cluster Count

Production always fits `KMeans(n_clusters=4, random_state=42, n_init=10)` — 4 is a
fixed product decision (this product is built around 4 stable business personas), not
something recomputed per run, so segment identity stays stable across deployments.

Before fitting the production model, the ml-service also evaluates candidate cluster
counts (k=3,4,5,6) via silhouette score, purely for observability — these scores are
logged (stdout, structured log line) but never exposed through the public API and
never change which k is actually used. This is a debugging/rigor aid, not a decision
input.

## Deterministic Persona Labels

New pure function `backend/platform/metrics/segmentLabel.ts`,
`computeSegmentLabels(centroids: Centroid[]): Map<number, string>` (keyed by
`cluster_id`), DB-free, unit-tested with fixture centroids — mirrors Phase 4's
`recommendedAction.ts` rule-table pattern.

1. Rank the 4 centroids by
   `overall = usage_score + adoption_score + support_score + revenue_score + seat_penetration_score`,
   descending.
2. Rank 1 (highest overall) → **"Power Users"**
3. Rank 4 (lowest overall) → **"At Risk"**
4. Of the middle two centroids, compute
   `revenue_score - (usage_score + adoption_score + seat_penetration_score) / 3` for
   each. The higher value → **"High Value, Low Engagement"**; the other →
   **"Expansion Opportunity"**.
5. Tie-break (float equality — near-impossible with real centroid data, but must be
   deterministic): the centroid with the higher raw `revenue_score` becomes
   "High Value, Low Engagement".

Final fixed persona set: **Power Users**, **Expansion Opportunity**,
**High Value, Low Engagement**, **At Risk**.

## Per-Company Assignment Metadata

Each company's assignment carries two derived diagnostic values, both computed in
TypeScript from the ml-service's returned assignment + centroids (not inside the ML
boundary):

- **`distance_to_centroid`**: Euclidean distance, in the 5-dim score space, between
  the company's own feature vector and its assigned cluster's centroid.
- **`cluster_confidence`**: a margin-based confidence score —
  `(distance_to_second_nearest_centroid - distance_to_own_centroid) / distance_to_second_nearest_centroid`,
  clamped to `[0, 1]`. A company sitting essentially on its centroid with the next-
  nearest cluster far away scores near 1; a company sitting nearly equidistant
  between two clusters (an ambiguous assignment) scores near 0.

New pure function `backend/platform/metrics/clusterConfidence.ts`,
`computeDistanceAndConfidence(companyVector: number[], ownCentroid: number[],
allCentroids: number[][]): { distance_to_centroid: number; cluster_confidence: number }`,
DB-free, unit-tested with fixture vectors.

## Segment Explainability (Driver Attribution)

Each company also gets `primary_driver`/`secondary_driver` — human-readable strings
naming which of its 5 sub-scores most distinguishes it, for later consumption by the
Phase 7 AI Copilot. New pure function `backend/platform/metrics/segmentDrivers.ts`:

1. Compute the population-wide average for each of the 5 sub-scores across all active
   companies.
2. For a given company, compute `deviation = company's own sub-score - population
   average` for each of the 5 sub-scores.
3. Rank the 5 deviations descending. The largest → `primary_driver`; second-largest →
   `secondary_driver`.
4. Map through a fixed dictionary: `usage_score` → `"High Product Usage"`,
   `adoption_score` → `"Strong Feature Adoption"`, `support_score` → `"Low Support
   Burden"`, `revenue_score` → `"High Plan Value"`, `seat_penetration_score` →
   `"Deep Organizational Adoption"`.
5. Tie-break (exact float equality): fixed order usage → adoption → support →
   revenue → seat_penetration, first wins — same convention as Phase 4's
   `findWeakest`/`findStrongest`.

`computeSegmentDrivers(companyScores: ScoreVector, populationAverages: ScoreVector):
{ primary_driver: string; secondary_driver: string }`, DB-free, unit-tested.

## ml-service: `POST /cluster`

New endpoint, `ml-service/main.py` (extends the existing FastAPI stub).

Request:
```json
{
  "companies": [
    { "company_id": "CMP-0001", "usage_score": 21, "adoption_score": 18,
      "support_score": 16, "revenue_score": 23, "seat_penetration_score": 14 }
  ]
}
```

Response:
```json
{
  "assignments": [{ "company_id": "CMP-0001", "cluster_id": 2 }],
  "centroids": [
    { "cluster_id": 0, "usage_score": 12.1, "adoption_score": 10.4,
      "support_score": 15.2, "revenue_score": 8.9, "seat_penetration_score": 6.3 }
  ],
  "metadata": {
    "algorithm": "kmeans", "algorithm_version": "v1", "random_seed": 42,
    "generated_at": "2026-07-31T18:00:00Z"
  }
}
```

Runs the k=3..6 silhouette evaluation (logged only, per Cluster Count above), then
fits the production `KMeans(n_clusters=4, random_state=42, n_init=10)` on the 5-dim
vectors and returns assignments + centroids + run metadata. Pure computation, no DB
access from the ml-service — it only ever sees what Encore sends it in the request
body.

## Persistence: `ensureSegmented()`

Mirrors Phase 1's `ensureSeeded()` idiom exactly: checks `ml_predictions` for any row
with `prediction_type='segment'`; if none exist, runs the full pipeline (fetch active
companies' 5-dim vectors → call ml-service → compute labels/distance/confidence/
drivers in TypeScript → batch insert, transaction-wrapped like Phase 1's seeding) and
persists one row per active company. Idempotent — a populated table is a no-op on
subsequent calls, same as `ensureSeeded()`.

No new migration. Uses existing `ml_predictions` columns:
- `prediction_type` = `'segment'`
- `prediction_date` = today's date
- `segment_label` = the persona name
- `model_version` = `"kmeans-v1"`
- `main_drivers` (JSONB) = everything else, denormalized per company row (the run's
  `algorithm`/`random_seed`/`generated_at` metadata is repeated on every company row
  from that run — no separate run-level table, consistent with this project's
  minimal-schema-change convention):

```json
{
  "cluster_id": 2,
  "usage_score": 21, "adoption_score": 18, "support_score": 16,
  "revenue_score": 23, "seat_penetration_score": 14,
  "distance_to_centroid": 0.42,
  "cluster_confidence": 0.93,
  "primary_driver": "High Product Usage",
  "secondary_driver": "Strong Feature Adoption",
  "algorithm": "kmeans", "algorithm_version": "v1", "random_seed": 42,
  "generated_at": "2026-07-31T18:00:00Z"
}
```

## API

`GET /customers/segments` — no query params, always returns exactly 4 rows in fixed
persona order (Power Users, Expansion Opportunity, High Value/Low Engagement, At
Risk — never sorted by count), computed by grouping the persisted `ml_predictions`
rows by `segment_label`:

```json
{
  "segments": [
    { "segment_label": "Power Users", "company_count": 245, "pct_of_total": 24.5,
      "avg_usage_score": 23, "avg_adoption_score": 22, "avg_support_score": 19,
      "avg_revenue_score": 21, "avg_seat_penetration_score": 24 }
  ]
}
```

No nested `centroid` object — it would be numerically identical to the `avg_*_score`
fields (a k-means centroid is exactly the mean of its assigned points at convergence),
so only the flat averages are exposed.

## Frontend

New route `/segments`, server-rendered, same conventions as every other page in this
project (Server Component, no client state). 4 `SegmentCard`s, each showing: persona
name, company count, % of total, and the 5 average sub-scores. Each persona uses one
fixed hue from the existing categorical `--series-1..4` palette as its identity color
(assigned in the fixed persona order above, not by count), reused consistently as the
segment's color wherever it might appear in a future phase.

## Testing

**ml-service** (pytest, extends existing `test_main.py`):
- `/cluster` returns exactly 4 clusters for a fixture set of companies
- every company in the request gets exactly one assignment
- centroids are returned for all 4 clusters
- calling `/cluster` twice with identical input and the fixed seed returns identical
  cluster assignments (determinism check)

**Backend** (`encore test`, calls the REAL running ml-service over HTTP via
`ML_SERVICE_URL`, default `http://localhost:8001` — no mocking, consistent with this
project's convention; `encore test` now requires Docker/Postgres AND a locally
running ml-service):
- `ensureSegmented()` populates `ml_predictions` with one `segment` row per active
  company, and is idempotent (second call is a no-op — row count unchanged)
- `GET /customers/segments` returns exactly 4 rows, in the fixed persona order,
  `company_count` sums to the total active-company count, `pct_of_total` values sum
  to ~100
- persisted rows include populated `cluster_confidence` and `distance_to_centroid`
  (non-null, in-range)

All 5 new pure metric functions (`seatPenetrationScore`, `segmentLabel`,
`clusterConfidence`, `segmentDrivers`) get their own fixture-based unit tests, DB-free,
matching the Phase 2–4 pattern.

## Definition of Done

- `ml-service` has a real `/cluster` endpoint using scikit-learn `KMeans` (k=4 fixed,
  seeded), with a silhouette-score evaluation step logged for observability only
- 4 new pure TypeScript metric functions (seat penetration, segment labeling,
  distance/confidence, driver attribution), each DB-free and unit-tested
- `ensureSegmented()` persists one row per active company to the existing
  `ml_predictions` table (no new migration), idempotent
- `GET /customers/segments` returns exactly 4 rows in fixed persona order with
  accurate counts/percentages/averages
- `/segments` page renders 4 real segment cards
- Full backend suite passes with the real ml-service running (no mocking); ml-service
  pytest suite passes; frontend `tsc --noEmit` clean

## Future Enhancement (Explicitly Out of Scope)

Comparing newly generated centroids against previous clustering runs to detect
customer-behavior drift, with large centroid movement or major cluster-composition
change triggering alerts or automatic retraining. Documented here for future
reference; not built in Phase 5.
