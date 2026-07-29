# Deployment

## Backend → Encore Cloud

```bash
cd backend
encore auth login
encore app create   # if not already created in Task 1; commit the updated encore.app
```

Connect this GitHub repo in the Encore Cloud dashboard, pointing at `backend/` as the app
root. Encore builds on every push to `main` and auto-provisions Postgres, applying
`platform/migrations/1_schema.up.sql`.

## Frontend → Vercel

Import this repo in the Vercel dashboard with **Root Directory = `frontend/`**, and set
`NEXT_PUBLIC_API_URL` to the deployed Encore Cloud base URL (e.g.
`https://<app>-<id>.encr.app`).

## ml-service → Railway

Deploy `ml-service/` as a Railway service (Dockerfile or Railway's Python buildpack). Not
yet called by the backend in Phase 1 — wired up starting Phase 5.

## Notes

- All data is synthetic and for demonstration only.
- No generated Encore client — the frontend uses plain `fetch` against `NEXT_PUBLIC_API_URL`.
