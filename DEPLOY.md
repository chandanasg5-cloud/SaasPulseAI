# Deployment

**Status: live.** All three services are deployed and working together.

- **Frontend**: [saas-pulse-ai.vercel.app](https://saas-pulse-ai.vercel.app) (Vercel project `saas-pulse-ai`)
- **Backend**: Encore Cloud, app `saas-pulse-ai-hgb2`, `staging` environment
  (`https://staging-saas-pulse-ai-hgb2.encr.app`)
- **ml-service**: Railway, `https://saaspulseai-production.up.railway.app`

## Backend → Encore Cloud

```bash
cd backend
encore auth login
encore app init saas-pulse-ai -l ts   # registers this code as a new Encore Cloud app
```

This is a monorepo, and `encore.app` lives in `backend/`, not the repo root. If
you register via `encore app init` (not the dashboard's GitHub-connect flow),
you must set **Root Directory = `backend`** by hand in the app's Encore Cloud
dashboard under Settings, or the build fails immediately with `encore.app not
found` (case-sensitive: `Backend` also fails, only lowercase `backend` works).

Set the Gemini secret for every environment type the app actually needs. The
`staging` environment here is type "Development", and Encore Cloud's
build-time test run behaves like a local `encore test` internally, so the
secret needs the `local` type too, not just `dev`/`prod`:

```bash
cd backend
encore secret set --type dev,prod,pr,local GeminiApiKey
```

`ML_SERVICE_URL` is also an Encore secret (`MlServiceUrl`, read via
`secret()` in `backend/platform/mlClient.ts`), not a plain environment
variable. Encore Cloud has no generic env-var dashboard feature, only
secrets, so set it the same way once ml-service is deployed:

```bash
encore secret set --type dev,prod,pr,local MlServiceUrl
# paste: https://saaspulseai-production.up.railway.app
```

Deploys trigger on `git push encore main` (the remote created by `encore app
init`), not on `git push origin main`. Push both:

```bash
git push origin main
git push encore main
```

**Important:** Encore Cloud's build-time test gate has no network or secret
access to reach an external service like ml-service. Any test that makes a
real call to it will fail the build regardless of how the secret is
configured. That's why `mlClient.test.ts`, `segmentation.test.ts`,
`churnPrediction.test.ts`, and the ml-service-dependent tests in `api.test.ts`,
`companyProfile.test.ts`, and `chatTools.test.ts` are gated behind
`RUN_ML_SERVICE_TESTS=1` (same pattern as `RUN_GEMINI_TESTS`, see `README.md`).
They still run for real locally when that flag is set; the Cloud build just
skips them by default.

## Frontend → Vercel

Import this repo with **Root Directory = `frontend`**. If importing fresh
through the dashboard sets Framework Preset to something other than Next.js
(seen happen when a project's Git connection gets repointed at a different
repo without updating its build settings), fix it under Settings, or via the
API:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/<project-id>?teamId=<team-id>" \
  -H "Authorization: Bearer <token>" \
  -d '{"rootDirectory": "frontend", "framework": "nextjs"}'
```

Set `NEXT_PUBLIC_API_URL` to the deployed Encore Cloud base URL, then deploy:

```bash
vercel deploy --prod --yes
```

Run this from the repo root, not `frontend/` (Vercel looks for `frontend/frontend`
otherwise), and clear `frontend/.next` first if a previous local build left
stale cache behind. `vercel deploy` uploads the local working tree rather than
cloning from GitHub, so a clean cache keeps it fast.

## ml-service → Railway

Set **Root Directory = `ml-service`** (same monorepo-subdirectory requirement
as the other two services). Railway's Nixpacks auto-build picks its own port
rather than honoring the `--port 8001` used in local dev; check the actual
Deploy Logs for the real line (`Uvicorn running on http://0.0.0.0:PORT`) and
enter that port when Railway asks for one to generate a public domain, don't
assume it matches the local dev port.

## Notes

- All data is synthetic and for demonstration only.
- No generated Encore client. The frontend uses plain `fetch` against
  `NEXT_PUBLIC_API_URL`.
- The AI Copilot's Gemini free tier is rate-limited (about 20 requests per
  day per model). Be aware of this before demoing the `/copilot` page live to
  multiple people in a short window.
