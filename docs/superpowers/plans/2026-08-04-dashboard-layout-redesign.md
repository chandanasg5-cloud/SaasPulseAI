# Dashboard Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal top nav with a shadcn/ui sidebar shell on all 6 pages and rebuild the Overview page to match the approved reference mock (KPI cards with deltas, 5-chart grid with 3 new donuts, Ask AI Analyst bar), backed by one new backend endpoint for churn-risk distribution.

**Architecture:** Almost entirely frontend (Next.js 15 App Router, `frontend/`). One backend addition in `backend/platform/api.ts`: `GET /customers/churn-risk/distribution`. The shell is the official shadcn/ui `sidebar` component wired to the existing (currently unused) `--sidebar-*` CSS tokens; the Overview page composes existing charts plus three new Recharts donut components.

**Tech Stack:** Next.js 15.5 (App Router, RSC), React 19, Tailwind v4 CSS-variable tokens, shadcn/ui (Base UI, CLI `shadcn@^4.16` already in frontend deps), Recharts 2, lucide-react, Encore.ts backend, vitest via `encore test`.

**Spec:** `docs/superpowers/specs/2026-08-04-dashboard-layout-redesign-design.md`

## Global Constraints

- Keep the existing blue brand palette and BOTH light and dark themes working. Chart colors always via CSS vars (`var(--series-N)`, `var(--status-*)`, `var(--chart-*)`) — never hard-coded hex in components.
- No decorative/non-functional controls (no date picker, Filters button, bell, avatar).
- Currency formatting stays GBP via `Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" })`, matching existing pages.
- Backend changes limited to the distribution endpoint. No ml-service changes.
- New backend tests that transitively call `ensureChurnPredicted()` MUST be gated with `describe.skipIf(!process.env.RUN_ML_SERVICE_TESTS)` — Encore Cloud's build-time test gate has no network access (this is why the pattern exists).
- All frontend paths below are relative to `frontend/`, backend paths to `backend/`. Repo root: `~/Desktop/SaasPluseAI`.
- Node is v22.23 — plain `node --test` runs `.mjs` tests that import erasable-TS `.ts` files directly (type stripping is on by default); import with the explicit `./file.ts` extension.
- Commit after every task. Do not push until the final task.

---

### Task 1: Backend churn-risk distribution endpoint + frontend API client

**Files:**
- Modify: `backend/platform/api.ts` (after the `customerChurnRisk` endpoint, ~line 562)
- Test: `backend/platform/api.test.ts` (append after the `customerChurnRisk` describe block)
- Modify: `frontend/lib/types.ts` (append)
- Modify: `frontend/lib/api.ts` (append)

**Interfaces:**
- Consumes: existing `ensureChurnPredicted()`, `db` from `./db`, `api` from `encore.dev/api` (all already imported in `api.ts`).
- Produces: `GET /customers/churn-risk/distribution` → `{ high: number; medium: number; low: number; total: number }`; frontend `getChurnRiskDistribution(): Promise<ChurnRiskDistribution>` and `interface ChurnRiskDistribution { high: number; medium: number; low: number; total: number }` (Task 4's `ChurnRiskDonutChart` and Task 7's page consume these).

- [ ] **Step 1: Write the failing test**

Append to `backend/platform/api.test.ts` (add `churnRiskDistribution` to the existing `./api` import at the top of the file):

```ts
// Gated: hits the real ml-service over the network, which Encore Cloud's
// build-time test gate cannot reach. Run locally with RUN_ML_SERVICE_TESTS=1.
describe.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("churnRiskDistribution", () => {
  it("returns per-level counts that sum to total and match the paginated endpoint", async () => {
    const dist = await churnRiskDistribution();
    expect(dist.total).toBeGreaterThan(0);
    expect(dist.high + dist.medium + dist.low).toBe(dist.total);

    const paginated = await customerChurnRisk({ page: 1, pageSize: 1 });
    expect(dist.total).toBe(paginated.total);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (ml-service must be running locally — `cd ml-service && .venv/bin/uvicorn app.main:app --port 8001` — if it isn't already):
`cd backend && RUN_ML_SERVICE_TESTS=1 encore test platform/api.test.ts -t churnRiskDistribution`
Expected: FAIL — `churnRiskDistribution` is not exported.
If the local ml-service can't run on this machine, note it and rely on Step 4's alternative; do NOT skip writing the test.

- [ ] **Step 3: Write the endpoint**

Append to `backend/platform/api.ts` after the `customerChurnRisk` endpoint:

```ts
interface ChurnRiskDistributionResponse {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export const churnRiskDistribution = api(
  { method: "GET", path: "/customers/churn-risk/distribution", expose: true },
  async (): Promise<ChurnRiskDistributionResponse> => {
    await ensureChurnPredicted();
    const counts = { high: 0, medium: 0, low: 0 };
    for await (const r of db.query<{ main_drivers: string }>`
      SELECT p.main_drivers::text AS main_drivers
      FROM ml_predictions p
      JOIN companies c ON c.id = p.company_id
      WHERE p.prediction_type = 'churn_probability'
    `) {
      const level = JSON.parse(r.main_drivers).risk_level as string;
      if (level === "high" || level === "medium" || level === "low") counts[level] += 1;
    }
    return { ...counts, total: counts.high + counts.medium + counts.low };
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && RUN_ML_SERVICE_TESTS=1 encore test platform/api.test.ts -t churnRiskDistribution`
Expected: PASS.
Also run the ungated suite to confirm nothing broke and the new test is skipped without the flag: `cd backend && encore test platform/api.test.ts` — expected: PASS with `churnRiskDistribution` listed as skipped.
*Alternative if the local ml-service cannot run:* the ungated run must pass with the new test skipped; the gated test then gets verified against the deployed backend in Task 8 (live curl).

- [ ] **Step 5: Add the frontend type and client function**

Append to `frontend/lib/types.ts`:

```ts
export interface ChurnRiskDistribution {
  high: number;
  medium: number;
  low: number;
  total: number;
}
```

Append to `frontend/lib/api.ts` (add `ChurnRiskDistribution` to the type-import at the top):

```ts
export async function getChurnRiskDistribution(): Promise<ChurnRiskDistribution> {
  const res = await fetch(`${API}/customers/churn-risk/distribution`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/churn-risk/distribution failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 6: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/platform/api.ts backend/platform/api.test.ts frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat: churn-risk distribution endpoint + client"
```

---

### Task 2: KPI delta helper (`lib/kpiDeltas.ts`)

**Files:**
- Create: `frontend/lib/kpiDeltas.ts`
- Test: `frontend/lib/kpiDeltas.test.mjs`

**Interfaces:**
- Consumes: `RevenueTrendPoint` (`{ month: string; mrr: number }`), `CustomerGrowthPoint` (`{ month: string; active_customers: number }`) from `frontend/lib/types.ts`.
- Produces: `computeKpiDeltas(revenueTrend: RevenueTrendPoint[], customerGrowth: CustomerGrowthPoint[]): KpiDeltas` where `interface KpiDeltas { mrrPct: number | null; arrPct: number | null; customersPct: number | null }`. `arrPct` always equals `mrrPct` (ARR = MRR×12, so the percent change is identical). `null` means "don't render a delta badge" (Task 5's `KpiCard` treats null as no badge; Task 7's page calls this).

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/kpiDeltas.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { computeKpiDeltas } from "./kpiDeltas.ts";

test("computes month-over-month percent deltas from the last two points", () => {
  const d = computeKpiDeltas(
    [{ month: "Apr", mrr: 100 }, { month: "May", mrr: 110 }],
    [{ month: "Apr", active_customers: 200 }, { month: "May", active_customers: 190 }],
  );
  assert.equal(d.mrrPct.toFixed(1), "10.0");
  assert.equal(d.arrPct, d.mrrPct);
  assert.equal(d.customersPct.toFixed(1), "-5.0");
});

test("uses the LAST two points of longer series", () => {
  const d = computeKpiDeltas(
    [{ month: "Mar", mrr: 1 }, { month: "Apr", mrr: 200 }, { month: "May", mrr: 150 }],
    [],
  );
  assert.equal(d.mrrPct.toFixed(1), "-25.0");
  assert.equal(d.customersPct, null);
});

test("returns null with fewer than 2 points", () => {
  const d = computeKpiDeltas([{ month: "May", mrr: 100 }], []);
  assert.equal(d.mrrPct, null);
  assert.equal(d.arrPct, null);
  assert.equal(d.customersPct, null);
});

test("returns null when the prior value is 0 (no divide-by-zero)", () => {
  const d = computeKpiDeltas(
    [{ month: "Apr", mrr: 0 }, { month: "May", mrr: 50 }],
    [{ month: "Apr", active_customers: 0 }, { month: "May", active_customers: 5 }],
  );
  assert.equal(d.mrrPct, null);
  assert.equal(d.customersPct, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test lib/kpiDeltas.test.mjs`
Expected: FAIL — cannot find module `./kpiDeltas.ts`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/kpiDeltas.ts`:

```ts
import type { CustomerGrowthPoint, RevenueTrendPoint } from "./types";

export interface KpiDeltas {
  mrrPct: number | null;
  arrPct: number | null;
  customersPct: number | null;
}

function pctChange(prev: number | undefined, last: number | undefined): number | null {
  if (prev === undefined || last === undefined || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

export function computeKpiDeltas(
  revenueTrend: RevenueTrendPoint[],
  customerGrowth: CustomerGrowthPoint[],
): KpiDeltas {
  const mrrPct = pctChange(revenueTrend.at(-2)?.mrr, revenueTrend.at(-1)?.mrr);
  const customersPct = pctChange(
    customerGrowth.at(-2)?.active_customers,
    customerGrowth.at(-1)?.active_customers,
  );
  // ARR = MRR × 12, so its month-over-month percent change is identical.
  return { mrrPct, arrPct: mrrPct, customersPct };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --test lib/kpiDeltas.test.mjs`
Expected: 4 pass. Then `cd frontend && npx tsc --noEmit` — expected: no errors (the `.mjs` file is outside tsc's scope; `kpiDeltas.ts` must type-check).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/kpiDeltas.ts frontend/lib/kpiDeltas.test.mjs
git commit -m "feat: month-over-month KPI delta helper"
```

---

### Task 3: App shell — sidebar, top bar, layout

**Files:**
- Generate (via CLI): `frontend/components/ui/sidebar.tsx` and whatever peers the CLI adds (e.g. sheet, tooltip, separator, input, `hooks/use-mobile`)
- Create: `frontend/lib/navItems.ts`
- Create: `frontend/components/AppSidebar.tsx`
- Create: `frontend/components/TopBar.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css` (sidebar token tints)
- Delete: `frontend/components/Nav.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from `@/components/ThemeToggle` (unchanged); shadcn sidebar exports (`SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarInset`).
- Produces: `NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[]` in `lib/navItems.ts` (single source of truth for routes/labels); `<AppSidebar />` and `<TopBar />` used only by `layout.tsx`. No other task depends on these names.

- [ ] **Step 1: Generate the shadcn sidebar**

Run: `cd frontend && npx shadcn add sidebar`
Accept whatever peer components it wants to add. Then run `git status` and review the generated files — do NOT hand-edit `components/ui/sidebar.tsx`; treat it like the other `components/ui/*` primitives. If the CLI overwrites an existing `ui/*` file (button/card/skeleton), inspect the diff and revert any overwrite that changes existing styling (`git checkout -- <file>`).

- [ ] **Step 2: Create the shared nav registry**

Create `frontend/lib/navItems.ts`:

```ts
import {
  BarChart3,
  Boxes,
  Home,
  Sparkles,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/product", label: "Analytics", icon: BarChart3 },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/segments", label: "Segments", icon: Boxes },
  { href: "/churn-risk", label: "Churn Prediction", icon: TrendingDown },
  { href: "/copilot", label: "AI Analyst", icon: Sparkles },
];
```

- [ ] **Step 3: Create AppSidebar**

Create `frontend/components/AppSidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NAV_ITEMS } from "@/lib/navItems";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--series-1)" }}
          >
            <Activity className="h-4 w-4 text-white" />
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            SaaSPulse <span style={{ color: "var(--series-1)" }}>AI</span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

If the generated sidebar's prop names differ from the above (e.g. no `tooltip` prop on `SidebarMenuButton`), adapt THIS file to the generated API — never the reverse.

- [ ] **Step 4: Create TopBar**

Create `frontend/components/TopBar.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_ITEMS } from "@/lib/navItems";

export function TopBar() {
  const pathname = usePathname();
  const label = NAV_ITEMS.find((item) => item.href === pathname)?.label ?? "SaaSPulse AI";

  return (
    <header
      className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur"
      style={{ backgroundColor: "var(--nav-tint)" }}
    >
      <SidebarTrigger />
      <span className="text-sm font-semibold">{label}</span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Rewire the root layout and delete Nav**

In `frontend/app/layout.tsx`, replace the `Nav` import with:

```tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
```

and replace the `<body>` contents:

```tsx
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <TopBar />
      {children}
    </SidebarInset>
  </SidebarProvider>
</body>
```

(The theme-restoring inline `<script>` in `<head>` stays exactly as is.)
Then: `rm frontend/components/Nav.tsx` and `grep -rn "components/Nav" frontend/` — expected: no hits.

- [ ] **Step 6: Tint the sidebar tokens toward the brand blue**

In `frontend/app/globals.css`, change ONLY these values (leave every other `--sidebar-*` line untouched):

In `:root` (light):

```css
--sidebar: oklch(0.98 0.008 250);
--sidebar-accent: oklch(0.93 0.03 255);
--sidebar-border: oklch(0.9 0.01 250);
```

In BOTH dark blocks that carry the chart vars — `@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) {...} }` AND `:root[data-theme="dark"]` (the legacy `.dark` block does not carry chart/series vars; leave it alone, same as the existing convention):

```css
--sidebar: oklch(0.18 0.012 250);
--sidebar-accent: oklch(0.28 0.04 255);
```

- [ ] **Step 7: Verify**

Run: `cd frontend && npx tsc --noEmit` — expected: no errors.
Run: `cd frontend && npm run dev` and load `http://localhost:3000/dashboard`, plus click through all 6 sidebar items. Check: active item highlights, collapse-to-icons works (trigger button), theme toggle still switches both shell and content, and at a narrow viewport (~390px, via devtools) the sidebar becomes a drawer/sheet. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A frontend
git commit -m "feat: replace top nav with shadcn sidebar shell"
```

---

### Task 4: Donut chart components (NRR ring, Segments, Churn Risk)

**Files:**
- Create: `frontend/components/charts/NrrDonutChart.tsx`
- Create: `frontend/components/charts/SegmentsDonutChart.tsx`
- Create: `frontend/components/charts/ChurnRiskDonutChart.tsx`

**Interfaces:**
- Consumes: `SegmentSummary` and `ChurnRiskDistribution` from `@/lib/types` (the latter added in Task 1); CSS vars `--series-1..4`, `--status-good/warning/critical`, `--chart-surface`, `--chart-grid`, `--chart-ink`.
- Produces: `<NrrDonutChart nrrPct={number} />`, `<SegmentsDonutChart segments={SegmentSummary[]} />`, `<ChurnRiskDonutChart distribution={ChurnRiskDistribution} />` — consumed by Task 7's dashboard page.

Dataviz rules applied here: categorical hues in fixed segment order (never cycled); status colors reserved for the risk donut, with a labeled legend + counts so identity is never color-alone; 2px surface-colored stroke as the gap between slices; text in text tokens, never series color; per-mark hover tooltips; palette validated by script, not by eye.

- [ ] **Step 1: Validate the palettes for donut adjacency**

The donuts put colors adjacent that the existing bar/line charts never did (including the red↔green wrap seam on the risk donut). From the dataviz skill base directory (`/private/tmp/claude-501/bundled-skills/2.1.221/fe4bf8721c1e3a5329ab4d8a7ba9c50f/dataviz`), run all four:

```bash
node scripts/validate_palette.js "#2a78d6,#008300,#e87ba4,#eda100" --mode light
node scripts/validate_palette.js "#3987e5,#008300,#d55181,#c98500" --mode dark
node scripts/validate_palette.js "#d03b3b,#fab219,#0ca30c" --mode light
node scripts/validate_palette.js "#e66767,#fab219,#0ca30c" --mode dark
```

Record each pass/fail in the commit message. CVD ΔE 6–8 on a pair is acceptable HERE because every donut ships a labeled legend with counts (secondary encoding). If any pair fails the normal-vision floor (<15) or falls below ΔE 6, STOP and flag it in the task report instead of changing the global status/series tokens — those are app-wide and were validated for the other charts.

- [ ] **Step 2: Create NrrDonutChart**

Create `frontend/components/charts/NrrDonutChart.tsx`. This is a hero number with a progress ring: the arc fills toward 100% and a full ring means ≥100% (net expansion) — the caption says so, because an arc for a >100% value is otherwise ambiguous.

```tsx
"use client";

import { Cell, Pie, PieChart } from "recharts";

export function NrrDonutChart({ nrrPct }: { nrrPct: number }) {
  const filled = Math.max(0, Math.min(nrrPct, 100));
  const data = [
    { name: "retained", value: filled },
    { name: "rest", value: 100 - filled },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[200px] w-[200px]">
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius="70%"
            outerRadius="88%"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill="var(--series-1)" />
            <Cell fill="var(--chart-grid)" />
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold">{nrrPct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Full ring = 100%+ (net expansion)</p>
    </div>
  );
}
```

- [ ] **Step 3: Create SegmentsDonutChart**

Create `frontend/components/charts/SegmentsDonutChart.tsx`. Colors keyed by segment label (fixed identity, not array position), matching the backend's fixed `SEGMENT_ORDER`:

```tsx
"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { SegmentSummary } from "@/lib/types";

const SEGMENT_COLORS: Record<string, string> = {
  "Power Users": "var(--series-1)",
  "Expansion Opportunity": "var(--series-2)",
  "High Value, Low Engagement": "var(--series-3)",
  "At Risk": "var(--series-4)",
};

export function SegmentsDonutChart({ segments }: { segments: SegmentSummary[] }) {
  const data = segments.map((s) => ({
    name: s.segment_label,
    value: s.company_count,
    pct: s.pct_of_total,
  }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <PieChart width={200} height={200}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="62%"
          outerRadius="88%"
          stroke="var(--chart-surface)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={SEGMENT_COLORS[d.name] ?? "var(--series-1)"} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [`${value.toLocaleString()} companies`, name]}
          contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
      </PieChart>
      <ul className="min-w-44 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: SEGMENT_COLORS[d.name] ?? "var(--series-1)" }}
            />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="font-medium">{d.pct.toFixed(0)}%</span>
            <span className="text-muted-foreground">({d.value.toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Create ChurnRiskDonutChart**

Create `frontend/components/charts/ChurnRiskDonutChart.tsx`:

```tsx
"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { ChurnRiskDistribution } from "@/lib/types";

const LEVELS = [
  { key: "high", label: "High Risk", color: "var(--status-critical)" },
  { key: "medium", label: "Medium Risk", color: "var(--status-warning)" },
  { key: "low", label: "Low Risk", color: "var(--status-good)" },
] as const;

export function ChurnRiskDonutChart({ distribution }: { distribution: ChurnRiskDistribution }) {
  const data = LEVELS.map((l) => ({ name: l.label, value: distribution[l.key], color: l.color }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative h-[200px] w-[200px]">
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            stroke="var(--chart-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toLocaleString()} customers`, name]}
            contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
          />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{distribution.total.toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
      <ul className="min-w-44 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-medium">
              {distribution.total === 0 ? "0" : ((d.value / distribution.total) * 100).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">({d.value.toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Type-check and commit**

Run: `cd frontend && npx tsc --noEmit` — expected: no errors (components are not yet imported anywhere; that's fine).

```bash
git add frontend/components/charts/NrrDonutChart.tsx frontend/components/charts/SegmentsDonutChart.tsx frontend/components/charts/ChurnRiskDonutChart.tsx
git commit -m "feat: NRR ring, segments, and churn-risk donut charts

Palette validation: <paste the four validator results here>"
```

---

### Task 5: KpiCard and AskAnalystBar components

**Files:**
- Create: `frontend/components/KpiCard.tsx`
- Create: `frontend/components/AskAnalystBar.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` from `@/components/ui/card`; lucide `ArrowUpRight`, `ArrowDownRight`, `ArrowRight`, `Sparkles`.
- Produces: `<KpiCard label value deltaPct? goodWhenDown? />` (`deltaPct?: number | null` — null/undefined renders no badge; `goodWhenDown` inverts badge color for metrics where a drop is good) and `<AskAnalystBar />` (GET form → `/copilot?q=...`). Both server-component-safe (no hooks). Consumed by Task 7.

- [ ] **Step 1: Create KpiCard**

Create `frontend/components/KpiCard.tsx`:

```tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: string;
  deltaPct?: number | null;
  goodWhenDown?: boolean;
}

export function KpiCard({ label, value, deltaPct = null, goodWhenDown = false }: KpiCardProps) {
  const hasDelta = deltaPct !== null && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct >= 0;
  const good = goodWhenDown ? !up : up;

  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {hasDelta && (
            <span
              className="inline-flex items-center gap-0.5 text-sm font-semibold"
              style={{ color: good ? "var(--status-good)" : "var(--status-critical)" }}
            >
              {up ? (
                <ArrowUpRight aria-label="up" className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight aria-label="down" className="h-3.5 w-3.5" />
              )}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          )}
        </div>
        {hasDelta && <p className="text-xs text-muted-foreground">vs last month</p>}
      </CardContent>
    </Card>
  );
}
```

(If `tsc` complains that `deltaPct` may be null inside the JSX despite `hasDelta`, extract `const delta = deltaPct ?? 0` after the guard and use `delta` — keep the rendered output identical.)

- [ ] **Step 2: Create AskAnalystBar**

Create `frontend/components/AskAnalystBar.tsx`:

```tsx
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AskAnalystBar() {
  return (
    <Card
      style={{
        background:
          "linear-gradient(90deg, color-mix(in oklab, var(--series-1) 12%, transparent), color-mix(in oklab, var(--series-3) 10%, transparent))",
      }}
    >
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--series-1)" }}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <p className="shrink-0 text-sm font-semibold">Ask AI Product Analyst</p>
        <form action="/copilot" method="get" className="flex min-w-48 flex-1 items-center gap-2">
          <input
            name="q"
            placeholder="Why did churn increase last quarter?"
            className="min-w-0 flex-1 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            aria-label="Ask the AI analyst"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: "var(--series-1)" }}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Type-check and commit**

Run: `cd frontend && npx tsc --noEmit` — expected: no errors.

```bash
git add frontend/components/KpiCard.tsx frontend/components/AskAnalystBar.tsx
git commit -m "feat: KPI card with delta badge and Ask AI Analyst bar"
```

---

### Task 6: Copilot page reads `?q=` prefill

**Files:**
- Create: `frontend/components/CopilotChat.tsx`
- Modify: `frontend/app/copilot/page.tsx`

**Interfaces:**
- Consumes: the entire current body of `app/copilot/page.tsx` (moved, not rewritten).
- Produces: `<CopilotChat initialQuestion?: string />`; `/copilot?q=...` pre-fills the input but NEVER auto-submits (submitting costs Gemini free-tier quota — user must press Send).

- [ ] **Step 1: Move the chat UI into a component**

Create `frontend/components/CopilotChat.tsx` containing the ENTIRE current contents of `frontend/app/copilot/page.tsx` with exactly three changes:

1. Rename the exported function: `export default function CopilotPage()` → `export function CopilotChat({ initialQuestion }: { initialQuestion?: string })`.
2. Seed the input state: `const [input, setInput] = useState("");` → `const [input, setInput] = useState(initialQuestion ?? "");`.
3. Keep the `"use client"` directive as the first line.

Everything else (streaming logic, message rendering, form) stays byte-identical.

- [ ] **Step 2: Make the page a thin server wrapper**

Replace `frontend/app/copilot/page.tsx` entirely with:

```tsx
import { CopilotChat } from "@/components/CopilotChat";

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <CopilotChat initialQuestion={q} />;
}
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit` — expected: no errors.
Run: `cd frontend && npm run dev`, open `http://localhost:3000/copilot?q=hello%20world` — the input shows "hello world", nothing auto-submits, and plain `/copilot` shows an empty input. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/CopilotChat.tsx frontend/app/copilot/page.tsx
git commit -m "feat: copilot accepts ?q= prefill from Ask AI bar"
```

---

### Task 7: Overview page restructure + skeleton

**Files:**
- Modify: `frontend/app/dashboard/page.tsx` (full rewrite below)
- Modify: `frontend/app/dashboard/loading.tsx` (full rewrite below)

**Interfaces:**
- Consumes: everything produced by Tasks 1, 2, 4, 5 — exact names as specified there — plus existing `RevenueTrendChart`, `CustomerGrowthChart`, `MrrWaterfallChart`, `SubscriptionBreakdownChart`, `getExecutiveOverview`, `getCustomerSegments`.
- Produces: the final Overview page. Nothing downstream.

- [ ] **Step 1: Rewrite the dashboard page**

Replace `frontend/app/dashboard/page.tsx` entirely with:

```tsx
import { getChurnRiskDistribution, getCustomerSegments, getExecutiveOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import { AskAnalystBar } from "@/components/AskAnalystBar";
import { computeKpiDeltas } from "@/lib/kpiDeltas";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { CustomerGrowthChart } from "@/components/charts/CustomerGrowthChart";
import { MrrWaterfallChart } from "@/components/charts/MrrWaterfallChart";
import { SubscriptionBreakdownChart } from "@/components/charts/SubscriptionBreakdownChart";
import { NrrDonutChart } from "@/components/charts/NrrDonutChart";
import { SegmentsDonutChart } from "@/components/charts/SegmentsDonutChart";
import { ChurnRiskDonutChart } from "@/components/charts/ChurnRiskDonutChart";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function DashboardPage() {
  const [overview, segmentsRes, churnDist] = await Promise.all([
    getExecutiveOverview(),
    getCustomerSegments(),
    getChurnRiskDistribution(),
  ]);
  const { kpis, charts } = overview;
  const deltas = computeKpiDeltas(charts.revenue_trend, charts.customer_growth);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Executive Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="MRR" value={formatCurrency(kpis.mrr)} deltaPct={deltas.mrrPct} />
        <KpiCard label="ARR" value={formatCurrency(kpis.arr)} deltaPct={deltas.arrPct} />
        <KpiCard label="Customers" value={kpis.customer_count.toLocaleString()} deltaPct={deltas.customersPct} />
        <KpiCard label="Churn Rate" value={formatPercent(kpis.churn_rate_pct)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>MRR Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={charts.revenue_trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net Revenue Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <NrrDonutChart nrrPct={kpis.nrr_pct} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customer Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerGrowthChart data={charts.customer_growth} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer Segments</CardTitle>
            <p className="text-sm text-muted-foreground">
              {segmentsRes.segments.length} active segments
            </p>
          </CardHeader>
          <CardContent>
            <SegmentsDonutChart segments={segmentsRes.segments} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Churn Risk Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">All customers</p>
          </CardHeader>
          <CardContent>
            <ChurnRiskDonutChart distribution={churnDist} />
          </CardContent>
        </Card>
      </div>

      <AskAnalystBar />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">More metrics</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Revenue Growth" value={formatPercent(kpis.revenue_growth_pct)} />
          <KpiCard label="CAC" value={formatCurrency(kpis.cac)} />
          <KpiCard label="CLV" value={formatCurrency(kpis.clv)} />
          <KpiCard label="NRR" value={formatPercent(kpis.nrr_pct)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>MRR Waterfall (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <MrrWaterfallChart data={charts.mrr_waterfall} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Subscription Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <SubscriptionBreakdownChart data={charts.subscription_breakdown} />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
```

Note what is intentionally GONE from this page: the `getCompanies` fetch, the customer `Table`, and the "SaaSPulse AI —" title prefix (the sidebar now carries the brand).

- [ ] **Step 2: Rewrite the loading skeleton**

Replace `frontend/app/dashboard/loading.tsx` entirely with:

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <Skeleton className="h-9 w-72" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-52 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-52 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Skeleton className="h-16 w-full" />
    </main>
  );
}
```

- [ ] **Step 3: Verify against real data**

Run: `cd frontend && npx tsc --noEmit` — expected: no errors.
With the backend running locally (`cd backend && encore run`; the ml-service only needs to be up if the local DB has no `ml_predictions` rows yet — `ensureChurnPredicted()` is a no-op once predictions exist; do NOT point at the deployed staging backend, which lacks the new distribution endpoint until Task 8 deploys it), run `cd frontend && npm run dev` and load `/dashboard`. Plausibility checks against seeded data (the project's recurring lesson — real data finds what fixtures don't): segments donut shows 4 segments summing to ~100%; churn donut total ≈ 1000 (all active companies) and matches the Churn Prediction page's total; KPI deltas are single-digit-ish percentages, not 0.0% or thousands; NRR ring full when NRR ≥ 100. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/page.tsx frontend/app/dashboard/loading.tsx
git commit -m "feat: rebuild Overview page to reference layout"
```

---

### Task 8: Whole-feature verification and deploy

**Files:**
- No new source files. Screenshots go to the session scratchpad, not the repo.

**Interfaces:**
- Consumes: everything above, assembled.

- [ ] **Step 1: Full local check**

```bash
cd frontend && npx tsc --noEmit && node --test lib/kpiDeltas.test.mjs && npm run build
cd ../backend && encore test
```

Expected: all pass (gated ml-service/Gemini tests skipped in the backend run).

- [ ] **Step 2: Screenshot pass, both themes**

With backend + frontend running locally, capture Playwright screenshots to the scratchpad: all 6 pages at 1440×900 in light AND dark (toggle via `localStorage.setItem("theme", ...)` + `data-theme` attribute, matching the app's mechanism), plus `/dashboard` at 390×844 (sidebar must be a drawer). LOOK at every screenshot: label collisions, donut legend wrapping, sidebar active state, AI bar layout, dark-mode chart surfaces. Fix and re-shoot anything wrong before proceeding.

- [ ] **Step 3: Push both remotes**

Integration per user's choice at execution time (previous precedent: feature branch merged to main after review, or straight to main — ask if unclear). Then:

```bash
git push origin main
git push encore main
```

`origin` deploys the Vercel frontend; `encore` deploys the backend (REQUIRED — the distribution endpoint is new). Watch the Encore build: its build-time test gate runs `encore test` internally — the new test must be skipped there (it is gated).

- [ ] **Step 4: Verify live**

```bash
curl -s https://staging-saas-pulse-ai-hgb2.encr.app/customers/churn-risk/distribution
```

Expected: JSON with `high + medium + low === total`, total > 0 (this also discharges Task 1's gated-test alternative if the local ml-service never ran). Then load `https://saas-pulse-ai.vercel.app/dashboard` — sidebar shell, donuts populated, AI bar submits to `/copilot` with the question prefilled. Spot-check one other page for the shell.

- [ ] **Step 5: Update docs**

Check `README.md` and `docs/ARCHITECTURE.md`/`docs/API.md` for statements the redesign invalidated (top-nav description, dashboard section list, endpoint inventory — add `/customers/churn-risk/distribution`). Edit only what's now wrong; commit and push both remotes again if anything changed.

```bash
git add README.md docs/
git commit -m "docs: update for sidebar shell and distribution endpoint"
```
