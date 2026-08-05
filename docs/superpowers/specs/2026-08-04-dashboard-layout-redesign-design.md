# Dashboard Layout Redesign — Design

**Date:** 2026-08-04
**Status:** Approved (Approach A — shadcn/ui sidebar)

## Goal

Rework the app's layout to match a reference dashboard mock: a left icon
sidebar replacing the horizontal top nav on all pages, and a redesigned
Overview page (KPI cards with trend deltas, a five-chart grid with three new
donut charts, and a prominent "Ask AI Product Analyst" bar).

Almost entirely frontend, plus one tiny backend addition: a churn-risk
distribution endpoint (the existing API only serves paginated cards, so
nothing can feed the "Churn Risk Distribution" donut). No ml-service
changes.

## Decisions (from brainstorming)

- **Scope:** new sidebar/top-bar shell wraps all 6 pages; only the Overview
  page's content is restructured. Other pages keep their content.
- **Nav items:** map the existing 6 routes only — no dead links, no
  placeholder Reports/Settings pages. Mock's naming adopted where routes
  allow: Overview `/dashboard`, Analytics `/product`, Customers `/customers`,
  Segments `/segments`, Churn Prediction `/churn-risk`, AI Analyst `/copilot`.
- **Top bar:** only real controls — sidebar trigger, page title, existing
  `ThemeToggle`. No decorative date-range picker, Filters button,
  notification bell, or avatar.
- **Color:** keep the existing validated blue palette and light/dark theme
  toggle. Adopt the mock's layout, not its purple accent.
- **Overview composition:** mock-faithful section first, existing extras
  below; the 25-row customer table is removed from Overview (the Customers
  page covers it).
- **KPI deltas:** computed in the frontend from data already returned; no
  backend changes. Churn Rate gets no delta (no prior-month value exists).

## Changes

### 0. Backend — churn-risk distribution endpoint

- New endpoint in `backend/platform/api.ts`:
  `GET /customers/churn-risk/distribution` →
  `{ high: number, medium: number, low: number, total: number }`.
  Reuses the same scoring path the existing churn-risk endpoint uses to
  build its full card list, but returns only `risk_level` counts.
- Frontend: `ChurnRiskDistribution` type in `lib/types.ts` and
  `getChurnRiskDistribution()` in `lib/api.ts`.
- Test: extend the backend test suite with a distribution test (counts sum
  to total; all three keys present). Follows existing test gating
  conventions — the endpoint touches only the DB, not the ml-service or
  Gemini, so it should NOT need `RUN_ML_SERVICE_TESTS`/`RUN_GEMINI_TESTS`
  gating unless the underlying scoring path calls the ml-service; verify
  which path the existing churn-risk endpoint tests take and mirror their
  gating exactly.

### 1. App shell — shadcn/ui sidebar

- Install the shadcn/ui `sidebar` component (`npx shadcn add sidebar`) and
  whatever peer primitives it brings (sheet, tooltip, separator, input).
- `app/layout.tsx`: replace `<Nav />` with `SidebarProvider` →
  `AppSidebar` + `SidebarInset`. Inside `SidebarInset`, a slim sticky top
  bar: `SidebarTrigger`, current page title, spacer, `ThemeToggle`.
- New `components/AppSidebar.tsx` (client component):
  - Header: SaaSPulse AI wordmark with a small brand icon.
  - Menu: the 6 items above with lucide icons (e.g. Home, BarChart3, Users,
    Blocks, TrendingDown, Sparkles). Active item from `usePathname()`.
  - Collapsible to icon rail on desktop; sheet/drawer on mobile (built into
    the shadcn sidebar).
- New `components/TopBar.tsx` (client component): derives the page title
  from `usePathname()` using the same route→label map (exported from a
  shared `lib/navItems.ts` so sidebar and top bar can't drift).
- Delete `components/Nav.tsx`.
- `globals.css`: tint the existing `--sidebar-*` tokens (currently neutral
  shadcn defaults, unused) toward the app's blue brand in both light and
  dark, consistent with `--nav-tint`.
- Page containers: pages currently use `mx-auto max-w-6xl p-6`; they keep
  that inside `SidebarInset` (content centers within the remaining width).

### 2. Overview page — mock-faithful top section

`app/dashboard/page.tsx` fetches via `Promise.all`:
`getExecutiveOverview()`, `getCustomerSegments()` (existing), and the new
`getChurnRiskDistribution()`. The customer-table fetch (`getCompanies`) is
dropped.

- **KPI row** — 4 new-style `KpiCard`s: MRR, ARR, Customers, Churn Rate.
  Large value + delta badge ("↑ 12.4% vs last month") + "vs last month"
  caption.
  - New `lib/kpiDeltas.ts` (pure, unit-testable): given
    `revenue_trend` and `customer_growth`, return month-over-month percent
    deltas for MRR (last two trend points), ARR (same delta as MRR — ARR is
    MRR×12), and customer count (last two growth points). Returns `null`
    when fewer than 2 points or the prior value is 0; card omits the badge.
  - Delta badge color: up=good green / down=bad red via `--status-good` /
    `--status-critical`. Churn Rate card: no badge (no prior value).
- **Chart grid, row of 3:**
  - "MRR Over Time" — existing `RevenueTrendChart`.
  - "Net Revenue Retention" — new `NrrDonutChart`: single-value donut ring
    showing `kpis.nrr_pct` with the percentage centered.
  - "Customer Growth" — existing `CustomerGrowthChart`.
- **Chart grid, row of 2:**
  - "Customer Segments" — new `SegmentsDonutChart`: donut of segment sizes
    with side legend (name, percent, count). Data: segments response.
    Categorical `--series-*` palette.
  - "Churn Risk Distribution" — new `ChurnRiskDonutChart`: donut of
    high/medium/low risk counts, total centered, side legend. Data: the
    new distribution endpoint. Status palette (`--status-critical`,
    `--status-warning`, `--status-good`).
- Responsive: 3-col and 2-col grids collapse to 1 col on small screens;
  KPI row goes 4 → 2 → 1.

### 3. Ask AI Analyst bar

New `components/AskAnalystBar.tsx` (server-component-friendly, no JS
state): a full-width card below the chart grid with brand-gradient tint,
sparkle icon, "Ask AI Product Analyst" heading, and a plain GET form —
text input named `q` (placeholder: "Why did churn increase last quarter?")
plus an arrow submit button — submitting to `/copilot`.

`app/copilot/page.tsx`: read `q` from `searchParams` and pre-fill the
question input with it (client page receives it as an initial value). The
existing Copilot UI is otherwise unchanged; it must not auto-submit.

### 4. Overview extras below the AI bar

A "More metrics" section:

- 4 small KPI tiles (current flat style): Revenue Growth, CAC, CLV, NRR.
- Two-up cards: existing `MrrWaterfallChart` and
  `SubscriptionBreakdownChart`.
- The customer table is removed.

### 5. Skeletons

Update `app/dashboard/loading.tsx` to mirror the new Overview structure
(KPI row, 3+2 chart grid, AI bar, extras). Other pages' skeletons keep
their content shape; `PageSkeleton` gains no nav bar since the shell (which
renders instantly) now owns navigation.

## Error handling

Almost no new failure modes: apart from the new distribution endpoint
(which reads the same data the churn-risk endpoint already reads), all data
comes from endpoints the app already calls elsewhere. If a fetch fails, the
page fails the same way other pages already do (Next error boundary).
`kpiDeltas` returns `null` rather than dividing by zero on degenerate
series.

## Testing & verification

- Backend: distribution endpoint test (see section 0).
- Unit: `lib/kpiDeltas.ts` covered by a small vitest/node test (normal
  case, <2 points, zero prior).
- `tsc --noEmit` and `next build` locally.
- Playwright screenshots of all 6 pages in light and dark at desktop width,
  plus Overview at mobile width (sidebar sheet) — inspect for real
  plausibility (donut values match seeded data), per the project's
  seeded-data verification pattern.
- Deploy: push BOTH remotes — `origin` (GitHub → Vercel frontend) and
  `encore` (Encore Cloud backend, needed for the new endpoint). Verify
  live URLs after.

## Out of scope

- Reports and Settings pages.
- Functional date-range filtering or global filters (backend feature).
- Purple rebrand; any ml-service change; backend changes beyond the
  distribution endpoint.
- Notification bell, user accounts/avatar.
