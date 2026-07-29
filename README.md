# SaaSPulse AI

An AI-powered SaaS Product Analytics & Growth Intelligence Platform — a portfolio project
demonstrating a production-shaped SaaS analytics product. All data is synthetic.

## Architecture

- `backend/` — Encore.ts, owns Postgres (native SQL DB + migrations). See `backend/platform/`.
- `frontend/` — Next.js 15 + TypeScript + Tailwind + shadcn/ui, deployed to Vercel.
- `ml-service/` — Python + FastAPI, deployed to Railway. ML modeling lands in later phases.
- `docs/superpowers/` — specs and implementation plans for each build phase.

Full Phase 1 design: `docs/superpowers/specs/2026-07-27-foundation-design.md`.

## Local development

Backend:

```bash
cd backend
npm install
encore run
```

The `platform` service self-seeds 1000 companies / 5000 users / 100,000 product events on
first request (see `backend/platform/seed.ts`).

Frontend:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Visit `http://localhost:3000/dashboard`.

ml-service:

```bash
cd ml-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Tests

```bash
cd backend && encore test
cd frontend && npx tsc --noEmit
cd ml-service && source .venv/bin/activate && pytest
```
