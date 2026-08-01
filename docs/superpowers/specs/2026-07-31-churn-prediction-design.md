# SaaSPulse AI — Phase 6: Churn Prediction (Module 5)

Status: Approved
Date: 2026-07-31

## Goal

Train a real XGBoost binary classifier to predict each active company's probability of
churning, with validated held-out performance metrics, deterministic per-company
explainability, and a `/churn-risk` page surfacing the highest-risk accounts first.

## Anti-Leakage: Reaffirming Phase 1's Locked-In Decision

Phase 1 already fixed the two churn-related concepts this phase must respect:

- **Training label** = actual churn: `subscriptions.status = 'canceled' AND end_date <= now()`.
- **Feature set** = observable behavioral signals only. The model must NEVER see the
  seed script's hidden `company_health_factor` or `true_churn_probability` — those exist
  only in memory during data generation and are never written to any table.

This phase's features are the 5 sub-scores Phase 4/5 already compute from raw
`product_events`/`support_tickets`/`subscriptions` data (never from the hidden variables)
plus 2 new raw signals in the same spirit. No new leakage surface is introduced.

## Feature Vector

7 features per company, computed identically for every company regardless of churn
status (verified below):

1. `usage_score` — Phase 4's `computeUsageScore` (reused, no redefinition)
2. `adoption_score` — Phase 4's `computeFeatureAdoptionScore` (reused)
3. `support_score` — Phase 4's `computeSupportScore` (reused)
4. `revenue_score` — Phase 4's `computeRevenueScore` (reused)
5. `seat_penetration_score` — Phase 5's `computeSeatPenetrationScore` (reused)
6. `tenure_days` — days between `companies.signup_date` and `now`
7. `recency_days` — days between the company's most recent `product_events.timestamp`
   and `now` (a company with zero events ever gets `tenure_days` as a fallback, since
   they've been "inactive" for their entire tenure)

**Why "as of now" is safe for churned companies too:** verified directly against
`backend/platform/generate/events.ts` — event generation (`buildEvent`) draws each
event's timestamp uniformly between the user's `activeSince` and the seed script's
global `now`, with volume driven by `monthlyRate = 0.5 + (healthFactor/100)*4.5`,
**independent of whether the company later churns**. Nothing in the generator cuts
event generation off at a company's cancellation date. So computing all 7 features
relative to today's wall-clock date, uniformly across both classes, does not create a
trivial "no recent data ⇒ label is churned" shortcut — the actual learnable signal is
the health-factor-driven correlation between score magnitude and churn likelihood, the
same signal Phase 4/5 already rely on.

## Model & Validation

New `ml-service` endpoint, `POST /predict-churn`:

1. Stratified 80/20 train/test split (stratified on the churn label, preserving the
   ~23% positive rate observed in the seeded data).
2. Fit `xgboost.XGBClassifier` on the 80% training split — modest `n_estimators`
   (100) and `max_depth` (4) given ~1000 rows and 7 features, to avoid overfitting a
   small dataset; fixed `random_state=42` for reproducibility, matching Phase 5's
   convention.
3. Evaluate on the held-out 20%: accuracy, precision, recall, and ROC-AUC — real
   metrics, not fabricated, reported in the response for observability (not gated on
   any pass/fail threshold; this phase reports model quality, it doesn't reject a
   "bad" model).
4. Refit the same hyperparameters on the **full** dataset (all ~1000 companies) —
   the model that actually produces the persisted predictions is trained on all
   available labeled data, not just the 80% split, following standard practice (the
   held-out split exists to validate architecture/hyperparameters, not to withhold
   data from the production fit).
5. Return per-company churn probabilities (for every company in the request, both
   classes — Encore decides downstream which to persist), model metadata, held-out
   metrics, and global `feature_importances_`.

## Per-Company Explainability (Deterministic, No SHAP Dependency)

New pure TypeScript function, `backend/platform/metrics/churnDrivers.ts`, computed in
Encore after the ml-service call — consistent with this project's established rule
that business/explainability logic stays outside the ML boundary as tested pure
functions (Phase 5's `segmentDrivers.ts` precedent).

For each of the 7 features, compute a **directional risk contribution** — positive
means "this feature is pushing risk up for this company":

- `usage_score`, `adoption_score`, `support_score`, `revenue_score`,
  `seat_penetration_score`: `(population_avg − company_value) × feature_importance`.
  Below-average is risk-increasing for all 5 (a low `support_score` already encodes
  "more/severer tickets," so this direction is correct without inversion).
- `tenure_days`: `(population_avg − company_value) × feature_importance`. Newer
  customers carry more risk.
- `recency_days`: `(company_value − population_avg) × feature_importance`. Longer
  since last activity carries more risk — this is the one feature with the sign
  flipped relative to the other 6.

Rank descending by contribution. Top 2 → `primary_risk_driver`/`secondary_risk_driver`,
mapped through this fixed dictionary:

| Feature | Driver label |
|---|---|
| `usage_score` | "Low Product Usage" |
| `adoption_score` | "Weak Feature Adoption" |
| `support_score` | "Elevated Support Activity" |
| `revenue_score` | "Low Plan Value" |
| `seat_penetration_score` | "Low Organizational Adoption" |
| `tenure_days` | "Short Tenure" |
| `recency_days` | "Inactive Recently" |

Tie-break (exact float equality): fixed feature order as listed in the table above,
first wins — the same tie-break convention used in Phase 4 and Phase 5.

Feature importances come from the model's own `feature_importances_` (learned, not
assumed), so drivers reflect what XGBoost actually weighted heavily — only the
*direction* per feature is a manual, documented modeling assumption (stated above),
not the *magnitude*.

## Risk Bands & Recommended Action

`probability >= 0.5` → `high`, `0.2–0.49` → `medium`, `< 0.2` → `low`. Asymmetric
bands (not 70/40 like Phase 4's health score) reflecting the ~23% base churn rate —
a company at even 50% probability is already far above baseline.

`ml_predictions.recommendation` (schema column exists since Phase 1, left unused by
Phase 5) gets a deterministic rule-table string keyed on risk tier + primary driver,
same style as Phase 4's `recommendedAction.ts`:

- **Low risk** (single message, no driver-specific text needed): "Healthy account —
  low churn risk, maintain regular touchpoints"
- **Medium risk** (by `primary_risk_driver`, non-urgent framing):
  - Low Product Usage → "Re-engagement outreach recommended — usage has softened"
  - Weak Feature Adoption → "Offer a feature adoption walkthrough to increase usage depth"
  - Elevated Support Activity → "Review recent support history — proactively check in"
  - Low Plan Value → "Monitor for renewal risk given plan/payment status"
  - Low Organizational Adoption → "Encourage broader team rollout to increase seat usage"
  - Short Tenure → "New account — schedule an onboarding check-in to reinforce early value"
  - Inactive Recently → "Reach out — no recent product activity detected"
- **High risk** (by `primary_risk_driver`, urgent framing):
  - Low Product Usage → "Urgent: re-engagement campaign needed — usage has dropped significantly"
  - Weak Feature Adoption → "Urgent: schedule an onboarding refresher — feature adoption is very low"
  - Elevated Support Activity → "Urgent: schedule a customer success check-in to resolve support issues"
  - Low Plan Value → "Urgent: address payment/plan issues before renewal"
  - Low Organizational Adoption → "Urgent: escalate to customer success — seat utilization is critically low"
  - Short Tenure → "Urgent: high churn risk during onboarding — assign a dedicated success contact"
  - Inactive Recently → "Urgent: immediate outreach required — account has gone dark"

## Persistence: `ensureChurnPredicted()`

Mirrors Phase 5's `ensureSegmented()` exactly: in-process memoized promise wrapping a
DB-level `COUNT(*) > 0` guard (`WHERE prediction_type = 'churn_probability'`),
`doPredict()` separately exported for direct testing of the DB-level guard. Fetches
all 1000 companies' 7-feature vectors (both classes, needed for training) and their
churn labels, calls `POST /predict-churn`, then persists one row **per active company
only** (same "not canceled" filter Phase 4/5 already use) into the existing
`ml_predictions` table:

- `prediction_type` = `'churn_probability'`
- `prediction_date` = today
- `churn_probability` = the model's predicted probability for that company
- `recommendation` = the deterministic action string
- `model_version` = `"xgboost-v1"`
- `main_drivers` (JSONB) = the 7 feature values, `primary_risk_driver`,
  `secondary_risk_driver`, `risk_level`, plus run metadata (algorithm, random_seed,
  held-out metrics, generated_at) — same denormalized-per-row pattern Phase 5 used,
  no new table.

No new migration — `ml_predictions.prediction_type`'s existing CHECK constraint
already allows `'churn_probability'`.

## API

`GET /customers/churn-risk?page=&pageSize=` — active companies only, **sorted by
churn probability descending** (highest risk first, unlike Phase 4/5's ID-ordered
lists — this page's whole purpose is surfacing what needs attention first), same
`page`/`pageSize` clamping convention as Phase 4's `/customers/health-scores`:

```json
{
  "companies": [{
    "company_id", "company_name", "churn_probability", "risk_level",
    "primary_risk_driver", "secondary_risk_driver", "recommendation"
  }],
  "total": number
}
```

## Frontend

New route `/churn-risk`, server-rendered, same pagination convention as `/customers`
(`?page=N` URL search param, `Promise`-typed `searchParams` per Next.js 15). A list of
`ChurnRiskCard`s (highest risk first): company name, probability as a percentage,
risk badge (reusing Phase 4's `--status-good`/`--status-warning`/`--status-critical`
icon+label pattern), the 2 driver strings, and the recommendation text.

## Testing

`ml-service` gets pytest coverage for `/predict-churn`: returns a probability in
`[0,1]` for every input company, held-out metrics are all in `[0,1]`, feature
importances are returned for all 7 features and sum to ~1, deterministic across calls
with the same seed.

Backend tests call the real running `ml-service` (no mocking, same convention as
Phase 5) — `ensureChurnPredicted()` idempotency, persisted-row count matches active
company count, `churn_probability` values are real (span a real range, not constant),
`GET /customers/churn-risk` returns results sorted descending by probability.

`churnDrivers.ts` gets its own fixture-based unit tests, DB-free, matching the
Phase 4/5 pattern for driver/label functions.

## Definition of Done

- `ml-service` has a real `POST /predict-churn` using `xgboost.XGBClassifier`,
  stratified 80/20 validation with reported held-out accuracy/precision/recall/AUC,
  final model refit on the full dataset
- `churnDrivers.ts` pure function computes deterministic, importance-weighted
  per-company risk drivers, unit-tested
- `ensureChurnPredicted()` persists one row per active company to the existing
  `ml_predictions` table (no new migration), idempotent
- `GET /customers/churn-risk` returns active companies sorted by probability
  descending, paginated
- `/churn-risk` page renders real predictions, risk badges, drivers, and
  recommendations
- Full backend suite passes with the real ml-service running (no mocking); ml-service
  pytest suite passes; frontend `tsc --noEmit` clean
