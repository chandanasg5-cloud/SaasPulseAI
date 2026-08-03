# SaaSPulse AI

An AI-powered SaaS Product Analytics & Growth Intelligence Platform — a portfolio
project demonstrating a production-shaped, full-stack SaaS analytics product.
All data is synthetic.

## What it does

SaaSPulse AI gives a SaaS company's leadership, product, and customer success
teams one place to see how the business is doing, powered by real machine
learning and a conversational AI analyst:

1. **Executive Command Center** (`/dashboard`) — MRR, ARR, CAC, CLV, churn rate,
   NRR, revenue trend, MRR waterfall, customer growth, subscription breakdown.
2. **Product Analytics** (`/product`) — DAU/WAU/MAU, stickiness, feature
   adoption, a 5-stage activation funnel, feature usage ranking, engagement
   trend, cohort retention.
3. **Customer Intelligence** (`/customers`) — a 0-100 health score per active
   company (usage/adoption/support/revenue sub-scores), risk level, and a
   deterministic recommended action.
4. **Customer Segmentation** (`/segments`) — real k-means clustering
   (scikit-learn) groups active companies into 4 personas: Power Users,
   Expansion Opportunity, High Value, Low Engagement, and At Risk.
5. **Churn Prediction** (`/churn-risk`) — a real XGBoost classifier trained on
   actual churn outcomes, with validated held-out accuracy/precision/recall/AUC,
   predicting each active company's churn probability with explainable drivers.
6. **AI Analyst Copilot** (`/copilot`) — a Google Gemini-powered chat assistant
   that answers business questions by calling the platform's own real endpoints
   as tools (never fabricating numbers), including looking up any single
   company by name.

## Architecture

- `backend/` — Encore.ts, single `platform` service, owns Postgres (native
  Encore-managed SQL DB + migrations). See `backend/platform/`.
- `frontend/` — Next.js 15.5 + React 19 + TypeScript + Tailwind v4 + shadcn/ui,
  deployed to Vercel (see `DEPLOY.md`).
- `ml-service/` — Python + FastAPI + scikit-learn + XGBoost, deployed to
  Railway. Called by the backend for customer segmentation (`POST /cluster`)
  and churn prediction (`POST /predict-churn`).
- `docs/superpowers/` — specs and implementation plans for each of this
  project's 8 build phases.
- `docs/ARCHITECTURE.md` — service topology diagram and explanation.
- `docs/DATABASE.md` — full schema reference with an ER diagram.
- `docs/API.md` — every endpoint's method/path/params/response shape.

## Local development

Start in this order — the backend's segmentation and churn-prediction
endpoints call the ml-service on first request.

ml-service:

```bash
cd ml-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Backend:

```bash
cd backend
npm install
encore secret set --type dev,local GeminiApiKey   # needed for the AI Copilot; get a key at https://aistudio.google.com/apikey
encore run
```

The `platform` service self-seeds 1000 companies / 5000 users / 100,000 product
events on first request (see `backend/platform/seed.ts`). Customer segmentation
and churn prediction also self-train on first request against the real
ml-service (see `backend/platform/segmentation.ts` and
`backend/platform/churnPrediction.ts`).

Frontend:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Visit `http://localhost:3000/dashboard` (and `/product`, `/customers`,
`/segments`, `/churn-risk`, `/copilot`).

## Tests

```bash
cd backend && encore test
cd frontend && npx tsc --noEmit
cd ml-service && source .venv/bin/activate && pytest
```

The AI Copilot's 2 real end-to-end Gemini tests are gated behind an env var so a
plain `encore test` never spends Gemini's rate-limited free-tier quota:

```bash
cd backend && RUN_GEMINI_TESTS=1 encore test chat.test.ts
```

## Deployment

Not yet deployed — see `DEPLOY.md` for the (unexecuted) deployment plan.
