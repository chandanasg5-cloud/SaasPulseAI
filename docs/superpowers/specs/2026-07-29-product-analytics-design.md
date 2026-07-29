# SaaSPulse AI — Phase 3: Product Analytics (Module 2)

Status: Approved
Date: 2026-07-29

## Goal

Build the Product Analytics module at a new `/product` route: user engagement metrics
(DAU/WAU/MAU, stickiness, feature adoption), the activation funnel, feature usage
ranking, and cohort retention — all computed from Phase 1's existing data (no new
migration needed, unlike Phase 2's `marketing_spend` table).

## Unified "Active User" Definition

A user is active in a given period if they have **at least one `product_event`** in
it. This single definition is used consistently for DAU/WAU/MAU and for cohort
retention — there is no second, different notion of "active" anywhere in this module.

## Activation Funnel

Five stages, each a count of users who have reached at least that stage:

1. **Signup** — `users.created_at` (always true for every user; this is the funnel's
   top)
2. **First Login** — `users.first_login_at` is not null
3. **First Feature Usage** — the user has at least one `product_event` row with a
   non-null `feature_name`
4. **Product Adoption** — the user has triggered events across **3 or more distinct
   `feature_name` values** (breadth-of-usage signal, not depth/frequency)
5. **Paid Conversion** — the user's company has a subscription with
   `plan_name != 'free'`

`Feature Adoption Rate` (a standalone KPI, separate from the per-feature ranking
chart) reuses this same "3+ distinct features" bar: it is the percentage of active
users (per the unified definition above) who have reached the Product Adoption
stage. One definition of "adopted," used everywhere in this module.

## KPIs

- **DAU** — distinct active users today (the calendar day of `now`)
- **WAU** — distinct active users in the trailing 7 days
- **MAU** — distinct active users in the trailing 30 days
- **Stickiness Ratio** — DAU ÷ MAU, as a percentage
- **Feature Adoption Rate** — percentage of active users (trailing 30 days) who have
  reached Product Adoption

## Charts

| Chart | Form | Color job | Notes |
|---|---|---|---|
| Feature usage ranking | Horizontal bar, ranked by event count per `feature_name` | Sequential (one hue) | Compare-magnitude job |
| Activation funnel | Horizontal bar, stage order (not magnitude-sorted) | Sequential (one hue) | Not one of the spec's 3 named charts, but needed to show the 5-stage dropoff; reuses the same bar form/color job as feature usage ranking rather than introducing a new form |
| User engagement trends | Line, trailing 30 days, 3 series (DAU/WAU/MAU) | Categorical (3 series) | All three share the same unit (user count), so no dual-axis issue — this is a "tell distinct series apart" job, not "compare two scales" |
| Cohort retention | Heatmap — rows = signup month, columns = months since signup, cell = % retained | Sequential (light→dark, low→high) | Compare-magnitude-on-a-grid job |

All charts get a hover/tooltip layer. The engagement trend's 3-series line gets a
legend (per the dataviz skill's series-count ladder: 1–3 series is comfortable with
direct labels/legend). The heatmap and both bar charts are single-hue sequential, so
no legend is needed — a color scale/axis label suffices.

## API

One consolidated endpoint: `GET /metrics/product-overview`:

```
{
  kpis: {
    dau: number,
    wau: number,
    mau: number,
    stickiness_pct: number,
    feature_adoption_pct: number
  },
  funnel: [
    { stage: "signup" | "first_login" | "first_feature_usage" | "product_adoption" | "paid_conversion", count: number }
  ],
  charts: {
    feature_usage_ranking: [{ feature_name: string, event_count: number }],
    engagement_trend: [{ date: string, dau: number, wau: number, mau: number }],
    cohort_retention: [{ cohort_month: string, months_since_signup: number, retention_pct: number }]
  }
}
```

`engagement_trend` covers the trailing 30 days (one point per day; `date` is a
`YYYY-MM-DD` string). `cohort_retention` is triangular data (a cohort from N months
ago only has N months of observed retention; `cohort_month` is a `YYYY-MM` string,
matching Phase 2's `monthKey()` format) — the frontend pivots this flat array into a
2D heatmap grid, rather than the backend pre-shaping it into a grid structure.

## Implementation Detail: Timestamp Handling

`product_events.timestamp` is a full `TIMESTAMPTZ`, unlike the bare `DATE` columns
used elsewhere in this schema (`signup_date`, `end_date`, `event_date` on
`subscription_events`). Phase 2 hit a real bug where bare `"YYYY-MM-DD"` strings
parse as UTC midnight while local-time month boundaries caused misclassification
near edges (fixed via `parseLocalDate`). A full timestamp with an explicit UTC
offset does **not** have this ambiguity — but casting it to text and re-parsing the
resulting non-ISO string (e.g. Postgres's default `timestamptz::text` output) risks
introducing a *different* parsing inconsistency. To avoid that entirely, this phase
fetches `product_events.timestamp` as a **native `Date`** (letting the Postgres
driver parse the column directly), not as a `::text`-cast string re-parsed in
TypeScript.

## Following the Established Metrics-Layer Architecture

Per Phase 2's design (validated across 13 tasks): pure, DB-free TypeScript functions
in `backend/platform/metrics/`, each unit-tested with hand-built fixture rows, called
by the endpoint after it fetches raw rows. This keeps every metric independently
testable and directly reusable by the Phase 7 AI Analyst Copilot. New functions:
`dau`/`wau`/`mau` (likely one function parameterized by window length, or three thin
wrappers around a shared windowed-active-user-count helper — a plan-time decision,
not a spec-time one), `stickiness`, `featureAdoptionRate`, `activationFunnel`,
`featureUsageRanking`, `cohortRetention`.

## Definition of Done

- 7 pure metric functions (or equivalent — see architecture note above), each
  unit-tested against hand-built fixture rows, no DB access inside any of them
- `GET /metrics/product-overview` returns real computed data from Phase 1's existing
  `product_events`/`users`/`subscriptions` tables — no new migration
- New `/product` page: 5 KPI tiles, activation funnel bar, feature usage ranking bar,
  engagement trend line (3 series), cohort retention heatmap
- Chart colors validated via the dataviz skill's `validate_palette.js` before
  shipping — categorical set for the 3-line trend, sequential hue for both bar
  charts and the heatmap
- Full backend suite (`encore test`) still passes; frontend `npx tsc --noEmit` clean
