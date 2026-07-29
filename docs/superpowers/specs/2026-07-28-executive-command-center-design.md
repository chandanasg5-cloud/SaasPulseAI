# SaaSPulse AI — Phase 2: Executive Command Center (Module 1)

Status: Approved
Date: 2026-07-28

## Goal

Replace Phase 1's placeholder `/dashboard` KPI row with the real Executive Command
Center: 8 SaaS business KPIs and 4 charts, all computed from Phase 1's seeded data
plus one new data source (marketing spend, needed only for CAC).

## Data Model: marketing_spend

One new table, added via a second migration:

```sql
CREATE TABLE marketing_spend (
    id     TEXT PRIMARY KEY,
    month  DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL
);
CREATE INDEX marketing_spend_month_idx ON marketing_spend(month);
```

One row per trailing month (~12-18 months, matching the existing signup window).

### Generation approach

Unlike Phase 1's generators, this one runs against the **already-seeded** database
rather than in-memory generator output — Phase 1's dataset is already committed and
won't be re-run. The generator:

1. Queries `subscription_events` for each trailing month's count of
   `new_subscription` events where the resulting plan is NOT `free` (CAC is
   calculated on paying customers only — including free-tier signups, which cost
   nothing to acquire, would distort a blended CAC number, which is standard SaaS
   practice, not a shortcut).
2. Synthesizes a plausible per-customer acquisition cost in the £150–£400 range
   (with randomness) and multiplies by that month's paying-customer count to get
   the month's spend.

Seeded via its own independent guard — `ensureMarketingSpendSeeded()` — which
checks `marketing_spend`'s row count and only seeds if empty. This does not touch
or re-trigger Phase 1's `ensureSeeded()`/`doSeed()`.

## Computation Layer

Pure TypeScript functions in `backend/platform/metrics/`, one file per concern:
`mrrTrend.ts`, `mrrWaterfall.ts`, `customerGrowth.ts`, `subscriptionBreakdown.ts`,
`churnRate.ts`, `nrr.ts`, `cac.ts`, `clv.ts`. Each takes already-fetched raw rows
(`subscription_events`, `subscriptions`, `companies`, `marketing_spend`) and
returns computed values — no DB access inside these functions. This keeps them
unit-testable without Postgres and directly reusable by the Phase 7 AI Analyst
Copilot, which will need the same metric logic to answer questions like "why did
revenue decline."

All financial metrics are event-sourced off `subscription_events`, exactly what
that table was built for in Phase 1:

- **MRR at any point in time** = cumulative sum of `mrr_change` for all events up
  to that date.
- **MRR waterfall for a month** = starting MRR (cumulative before the month) + new
  + expansion + contraction + churned (each summed from that month's events by
  `event_type`) = ending MRR. `renewal` events carry `mrr_change = 0` (per Phase 1
  design) and are correctly excluded from the waterfall math.
- **NRR** = (starting MRR + expansion − contraction − churn) ÷ starting MRR, where
  the cohort is companies that already had an active subscription at month start —
  new-customer MRR from that same month is deliberately excluded. This is the
  standard NRR definition, not a simplification.
- **Revenue growth %** = (this month's ending MRR − last month's ending MRR) ÷ last
  month's ending MRR — month-over-month, not trailing-12-month.
- **Customer count** = active (non-churned) companies as of now.
- **Churn rate** = churned companies this month ÷ active companies at month start.
- **CLV** = ARPU (paying customers only) ÷ monthly churn rate.
- **CAC** = this month's marketing spend ÷ this month's new paying customers.
- **Customer growth** = count of companies with an active subscription as of each
  month's end, over the trailing 12 months.
- **Subscription breakdown** = active subscriptions grouped by `plan_tier`, with
  count and total MRR per tier.

## API

One consolidated endpoint, replacing Phase 1's `GET /metrics/overview` (whose
`total_users`/`total_events` fields belong to Product Analytics, not an executive
view, and were only placeholders):

`GET /metrics/executive-overview` — returns:

```
{
  kpis: {
    mrr, arr, revenue_growth_pct, customer_count,
    cac, clv, churn_rate_pct, nrr_pct
  },
  charts: {
    revenue_trend: [{ month, mrr }],
    mrr_waterfall: { starting_mrr, new_mrr, expansion_mrr, contraction_mrr, churned_mrr, ending_mrr },
    customer_growth: [{ month, active_customers }],
    subscription_breakdown: [{ plan_tier, count, mrr }]
  }
}
```

`arr` is derived as `mrr * 12`, not separately tracked or plotted — showing MRR and
ARR as two trend lines on one chart would require two y-axes (the #1 charting
anti-pattern per the dataviz skill, since ARR is just MRR at a different scale).
ARR is a KPI stat tile only.

## Frontend

`/dashboard`'s KPI row is replaced entirely with the 8 real values (currency
formatting for MRR/ARR/CAC/CLV, percentage for revenue growth/churn/NRR, plain
number for customer count). The existing customer table stays below, unchanged.
Recharts is added as a new frontend dependency.

Chart forms, chosen by data job per the dataviz skill (not by default/habit):

| Chart | Form | Color job | Why |
|---|---|---|---|
| Revenue trend | Line, single series (MRR only) | Sequential (blue) | Trend over time, one series |
| MRR waterfall | Bridge/waterfall bars — starting/ending as neutral totals, new/expansion as **good** (green), contraction/churn as **critical** (red) | Status (polarity) | The job is "above/below a baseline," not identity — status colors, not categorical |
| Customer growth | Line, single series | Sequential (blue) | Trend over time, one series |
| Subscription breakdown | Single stacked bar, 4 segments (plan tiers) | Categorical, fixed order | Part-to-whole across 4 named categories |

All 4 charts get a hover/tooltip layer (interactive by default per the dataviz
skill). The subscription-breakdown stacked bar (4 series) gets a legend; the two
single-series line charts don't need one. Before shipping, the categorical
4-color set and the status good/critical colors both get run through
`validate_palette.js` — not eyeballed.

## Definition of Done

- Second migration adds `marketing_spend`
- Generator + independent seeding guard populate realistic spend correlated with
  real new-paying-customer counts already in the DB
- 8 metric functions, each unit-tested against hand-built fixture rows (no DB
  required for these tests)
- `GET /metrics/executive-overview` returns real computed KPIs + all 4 chart
  datasets from the live seeded data; `GET /metrics/overview` is removed
- `/dashboard` KPI row shows the 8 real values with correct formatting; customer
  table unchanged below it
- All 4 charts render with correct forms/colors per the table above, palette
  validated via script, hover/tooltip present, legend where required
- Full backend suite (`encore test`) still passes cleanly alongside the new tests
