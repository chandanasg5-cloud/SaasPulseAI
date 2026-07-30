# SaaSPulse AI — Phase 4: Customer Intelligence (Module 3)

Status: Approved
Date: 2026-07-30

## Goal

Build customer health scoring at a new `/customers` route: a 0-100 Health Score per
active company, broken into 4 weighted sub-scores, a risk level, and a deterministic
recommended action — displayed as a paginated grid of Customer Cards.

## Scope Decision: Live Computation, Not Persistence

Phase 1 designed `customer_health_scores` as a time series ("one row per company per
scoring run"), but the original spec's "Customer Card" only needs a CURRENT score per
company. Following this project's established pattern (Phases 2-3 compute everything
live from raw data, no intermediate persistence), Phase 4 computes scores live in the
API endpoint. **`customer_health_scores` stays empty by design** — this is a deliberate
scope decision, not an oversight. Real history/persistence can be added in a later
phase if a "health score trend" feature is ever wanted; it is out of scope here.

## Scope Decision: Active Companies Only

Health scores and recommended actions exist to drive action on customers you can still
retain or grow. A company with a `canceled` subscription has already churned — showing
it here would be noise, not signal. `/customers` and its endpoint only include
companies whose subscription is NOT `canceled` (or has no `end_date` in the past).

## Scoring Formulas

Each sub-score is 0-25; they sum to a 0-100 overall Health Score.

- **Usage Score** = (company's users active in the trailing 30 days ÷ company's total
  users) × 25. "Active" reuses Phase 3's unified definition (≥1 `product_event`).
- **Feature Adoption Score** = Phase 3's `computeFeatureAdoptionRate` (0-100), called
  with only this company's events, ÷ 4. Reuses the exact "3+ distinct features,
  trailing 30 days" definition already established — no redefinition, no drift.
- **Support Score** = 25 minus a severity-weighted penalty for support tickets in the
  trailing 90 days (low=1, medium=2, high=3, urgent=5 points), floored at 0. A quiet
  company scores near 25; frequent/severe tickets pull it toward 0.
- **Revenue Score** = base points by plan tier (free=5, starter=12, professional=18,
  enterprise=25), halved if the subscription status is `past_due`.

**Risk level**: overall ≥70 = `low`, 40-69 = `medium`, <40 = `high`.

## Recommended Action (Deterministic Rule Table)

Not AI-generated — Module 6 (Phase 7) owns natural-language generation. This is a
fixed lookup keyed on risk level and (for medium/high risk) the weakest of the 4
sub-scores:

| Risk | Weakest sub-score | Recommended action |
|---|---|---|
| Low | revenue is the strongest sub-score | "Consider enterprise upgrade discussion" |
| Low | (otherwise) | "Healthy account — maintain regular touchpoints" |
| Medium | adoption | "Offer a feature adoption walkthrough to increase usage depth" |
| Medium | usage | "Re-engagement outreach recommended — usage has softened" |
| Medium | support | "Review recent support history — proactively check in" |
| Medium | revenue | "Monitor for renewal risk given plan/payment status" |
| High | adoption | "Urgent: schedule an onboarding refresher — feature adoption is very low" |
| High | usage | "Urgent: re-engagement campaign needed — usage has dropped significantly" |
| High | support | "Urgent: schedule a customer success check-in to resolve support issues" |
| High | revenue | "Urgent: address payment/plan issues before renewal" |

Ties for "weakest" broken by the fixed order usage → adoption → support → revenue.

## Architecture

Follows the pure-function pattern established in Phases 2-3:
`backend/platform/metrics/usageScore.ts`, `featureAdoptionScore.ts` (thin wrapper
around Phase 3's `computeFeatureAdoptionRate`), `supportScore.ts`, `revenueScore.ts`,
`healthScore.ts` (combines the 4 sub-scores into overall + risk level),
`recommendedAction.ts` (risk + sub-scores → text per the table above). Each is
DB-free, unit-tested with fixture rows, and reusable by the Phase 7 AI Copilot.

A new `CompanyEventRow` type (`company_id`, `user_id`, `feature_name`, `timestamp`)
lets the endpoint fetch `product_events` once with `company_id` included directly
(it's a real column on that table) and group by company without a separate
user→company join — more efficient than Phase 3's user-centric approach, appropriate
since Phase 4 needs per-company aggregation at scale (~700-900 active companies).

## API

`GET /customers/health-scores?page=&pageSize=`:

```
{
  customers: [{
    company_id, company_name, plan_tier,
    usage_score, adoption_score, support_score, revenue_score,
    overall_score, risk_level, recommended_action
  }],
  total: number
}
```

Active companies only (same "not canceled" filter as the scope decision above). Same
`page`/`pageSize` clamping convention as Phase 1's `/companies` endpoint (min 1, max
100 per page).

## Frontend

New route `/customers`, server-rendered — pagination via URL search param (`?page=N`)
with Previous/Next links, no client-side state needed (consistent with every other
page in this project being a Server Component). A grid of Customer Cards, each
showing: Company Name, Health Score (large, `/100`), Risk badge, and the Recommended
Action text. Risk badge color uses the dataviz skill's status palette directly:
`low` → good, `medium` → warning, `high` → critical — the three-way risk_level maps
onto exactly the skill's three relevant status roles, not an invented fourth tone.

## Definition of Done

- 6 pure metric functions, each unit-tested against hand-built fixture rows, no DB
  access inside any of them
- `GET /customers/health-scores` returns real computed scores for active companies
  only, from Phase 1's existing `users`/`product_events`/`support_tickets`/
  `subscriptions` tables — no new migration
- `/customers` page: paginated Customer Card grid with all 4 display fields
- `customer_health_scores` table remains empty (by design, per the scope decision
  above)
- Full backend suite (`encore test`) still passes; frontend `npx tsc --noEmit` clean
