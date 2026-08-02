# Deployment

**Status: not yet executed.** This file documents the deployment plan; no
deployment has actually been performed. All three services would need their
own accounts/setup below.

## Backend → Encore Cloud

```bash
cd backend
encore auth login
encore app create   # if not already created; commit the updated encore.app
```

Connect this GitHub repo in the Encore Cloud dashboard, pointing at `backend/`
as the app root. Encore builds on every push to `main` and auto-provisions
Postgres, applying all migrations in `platform/migrations/`.

Set the production Gemini secret before the AI Copilot will work in
production:

```bash
cd backend
encore secret set --type prod GeminiApiKey
```

## Frontend → Vercel

Import this repo in the Vercel dashboard with **Root Directory = `frontend/`**,
and set `NEXT_PUBLIC_API_URL` to the deployed Encore Cloud base URL (e.g.
`https://<app>-<id>.encr.app`).

## ml-service → Railway

Deploy `ml-service/` as a Railway service (Dockerfile or Railway's Python
buildpack). This is called by the backend for real customer segmentation
(`POST /cluster`, Phase 5) and churn prediction (`POST /predict-churn`, Phase
6) — set the backend's `ML_SERVICE_URL` environment variable to the deployed
Railway URL once this service is live.

## Notes

- All data is synthetic and for demonstration only.
- No generated Encore client — the frontend uses plain `fetch` against
  `NEXT_PUBLIC_API_URL`.
- The AI Copilot's Gemini free tier is rate-limited (~20 requests/day/model) —
  be aware of this before demoing the `/copilot` page live to multiple people
  in a short window.
