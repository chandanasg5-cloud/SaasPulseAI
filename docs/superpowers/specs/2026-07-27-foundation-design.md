# SaaSPulse AI — Phase 1: Foundation

Status: Approved
Date: 2026-07-27

## Product Context

**SaaSPulse AI** is a fictional B2B SaaS Product Analytics platform. Companies use it to
monitor user engagement, product adoption, customer health, retention, and revenue growth.
This spec covers only the foundation layer — later phases (tracked as Phase 2–8) build the
actual analytics modules on top of it.

Customer profile: small businesses, mid-market companies, enterprise organizations.

Subscription plans (MRR in GBP):

| Plan | Target | Seats | MRR | Share of customers |
|---|---|---|---|---|
| Free | Individuals / small teams | 1–3 | £0 | ~70% combined with Starter |
| Starter | Small businesses | 3–10 | £99 | |
| Professional | Growing companies | 10–50 | £499 | ~25% |
| Enterprise | Large organizations | 50–500 | £5,000+ | ~5% |

## Architecture

Monorepo, matching the Healthcare Claims project's conventions:

```
SaasPluseAI/
├── backend/           Encore.ts — one service per bounded domain
│   └── platform/       owns the full schema (companies, users, subscriptions, ...)
├── frontend/          Next.js 15 + TypeScript + Tailwind + shadcn/ui, deployed to Vercel
├── ml-service/         Python (FastAPI + Pandas/scikit-learn/XGBoost), deployed to Railway
└── docs/superpowers/   specs + plans
```

- Encore's native SQL database + migrations manage Postgres directly (no external host like
  Neon — Encore provisions Postgres itself for local dev and each deployed environment).
- `platform` is the only Encore service in Phase 1 and owns the entire schema. Later
  services (churn, copilot) call `platform` via Encore's type-safe RPC rather than touching
  its database directly — this avoids Encore's cross-service DB access restrictions and
  keeps the heavily-joined dashboard queries fast.
- `ml-service` is stateless. It never owns data — Encore sends it data over HTTP and
  receives predictions/clusters back. In Phase 1 it's a stub with only a health check.
- AI Analyst Copilot (Phase 7) will call Google Gemini, not OpenAI, despite the
  OpenAI-compatible interface shape mentioned in the original prompt.

## Database Schema

Eight tables, all owned by `platform`:

### companies
Core B2B account record.
- `id`, `name`, `industry`, `company_size` (employee count), `plan_tier`
  (free/starter/professional/enterprise), `customer_stage`
  (trial/onboarding/active/growing/power_user/at_risk/churned), `signup_date`, `created_at`

### users
Individual seats within a company.
- `id`, `company_id` (FK), `email`, `role`, `first_login_at`, `last_login_at`, `is_active`,
  `created_at`

### subscriptions
Current billing state per company.
- `id`, `company_id` (FK), `plan_name`, `mrr_amount`, `billing_cycle` (monthly/annual),
  `status` (active/canceled/trialing/past_due), `start_date`, `end_date` (nullable),
  `created_at`, `updated_at`

### subscription_events
Append-only log of billing lifecycle changes — this is what makes the MRR waterfall,
revenue expansion analysis, and churn revenue impact computable without re-deriving state
from `subscriptions` snapshots.
- `subscription_event_id`, `company_id` (FK), `event_date`, `event_type`
  (new_subscription/upgrade/downgrade/cancellation/renewal), `previous_plan` (nullable),
  `new_plan` (nullable), `mrr_change`

### product_events
Usage tracking — drives DAU/WAU/MAU, activation funnel, feature adoption, and the usage
component of health scoring.
- `event_id`, `user_id` (FK), `company_id` (FK), `timestamp`, `event_name`, `feature_name`
  (nullable), `session_duration` (seconds), `device_type` (desktop/mobile/tablet)

Event names, grouped by category:
- Authentication: `user_login`, `user_logout`
- Product usage: `dashboard_viewed`, `report_created`, `report_exported`,
  `analytics_viewed`, `data_uploaded`
- Feature adoption: `integration_connected`, `automation_created`, `workflow_created`,
  `api_call`, `team_member_invited`
- Customer intent: `billing_page_viewed`, `pricing_page_viewed`, `help_center_viewed`,
  `support_requested`

### support_tickets
Feeds the support component of health scoring and churn features.
- `id`, `company_id` (FK), `user_id` (FK, nullable), `subject`, `priority`
  (low/medium/high/urgent), `status` (open/closed/pending), `created_at`, `resolved_at`
  (nullable)

### customer_health_scores
Time series, not a single current value — one row per company per scoring run, so trends
are queryable. Populated starting in Phase 4; empty in Phase 1.
- `id`, `company_id` (FK), `score_date`, `usage_score`, `adoption_score`, `support_score`,
  `revenue_score`, `overall_score`, `risk_level`, `recommended_action`

### ml_predictions
Output of the Python ML service, written back by Encore after calling it. Populated
starting in Phase 5/6; empty in Phase 1.
- `id`, `company_id` (FK), `prediction_type` (churn_probability/segment), `prediction_date`,
  `churn_probability` (nullable), `segment_label` (nullable), `main_drivers` (jsonb),
  `recommendation`, `model_version`

## Churn: Two Distinct Concepts

**A. Actual customer churn** — `subscriptions.status = 'cancelled' AND end_date <= now()`.
Used for historical churn rate, revenue analysis, MRR waterfall. This is also the
**training label** for the Phase 6 ML model.

**B. Behavioral churn risk** — declining login activity, reduced feature usage, increased
support tickets, lower engagement. Derived from `product_events` and `support_tickets`
trends. Used for customer health scoring (Phase 4) and as the **feature set** (predictors)
for the Phase 6 ML model. It is a heuristic signal, never itself the training target.

## Synthetic Data Generation

A TypeScript seed script (matching the Healthcare Claims `seed.ts` pattern), run against
Encore's local Postgres, generating:

- **1000 companies** — signups spread over the trailing ~18 months, plan_tier skewed
  Free/Starter ~70%, Professional ~25%, Enterprise ~5%
- **5000 users** — seat count per company correlated with plan_tier
- **100,000 product_events** — over the trailing 12 months
- **subscriptions** + **subscription_events** — enough history to compute monthly MRR
  waterfall (starting MRR + new + expansion − downgrade − churned = ending MRR) for the
  last 12 months
- **support_tickets** — volume correlated with company health

### Hidden generation-only variables

Two variables exist **only inside the seed script**, in memory, and are **never written to
any table or exposed via any API** — this is what prevents data leakage into the Phase 6 ML
model:

- **`company_health_factor`** (0–100, per company): drives login frequency, feature
  adoption breadth, support ticket volume/urgency, new-user growth, expansion probability,
  and `customer_stage`.
  - Healthy (80–100): high login frequency, multiple features used, low tickets, more users
    added, higher expansion probability
  - Neutral (50–80): moderate usage, normal support activity, stable subscription
  - At risk (0–50): declining logins, low feature adoption, more tickets, higher
    cancellation probability
- **`true_churn_probability`** (per company): used only to decide whether the synthetic
  script generates a cancellation `subscription_event` for that company. The Phase 6 ML
  model is trained to *predict* churn probability from observable behavioral data — it must
  never see this value, only the actual realized outcome (did they cancel or not) plus the
  behavioral signals that `company_health_factor` produced.

Without these hidden variables, Phase 4 (segmentation) would find no real clusters and
Phase 6 (churn prediction) would have nothing learnable — the ML would be decorative rather
than functional.

## Phase 1 API Endpoints (Encore, `platform` service)

- `GET /health` — service health check
- `GET /companies/count` — `{ total_companies, active_companies, churned_companies }`
  (active/churned derived from actual churn definition above)
- `GET /companies` — paginated, filterable by plan_tier and industry
- `GET /metrics/overview` — total companies, total users, total events, current MRR

## Phase 1 Frontend

Route: `/dashboard`

- KPI cards: Total Companies, Total Users, Product Events, Current MRR (£)
- Customer table: Company Name, Industry, Plan, Customer Stage, MRR
- All data fetched live from the Encore API — no mocked frontend data

## Definition of Done

- Encore migrations apply cleanly, `platform` service runs locally
- Seed script populates all raw tables (companies, users, subscriptions,
  subscription_events, product_events, support_tickets) at target volumes, with the hidden
  health-factor correlations in place
- `customer_health_scores` and `ml_predictions` exist as empty tables (populated in later
  phases)
- The four Phase 1 Encore endpoints work and return real seeded data
- `/dashboard` renders live KPI cards and the customer table from the Encore API
- `ml-service` is a minimal FastAPI stub (health check only) — proves it's deployable,
  real modeling comes in Phase 5/6
- Frontend verified via `tsc` and a deployed preview rather than trusting local
  `next dev`/`next build`, which have hung on this machine for other Next.js projects
  — **amended 2026-07-28:** Phase 1 shipped with local-only verification (`tsc --noEmit`
  plus a short-lived local `next dev` against local Encore/Postgres). The deployed-preview
  check is deferred by user decision to a later phase, once more of the product exists.
- Everything committed to git, with a README stub on how to run each piece locally
