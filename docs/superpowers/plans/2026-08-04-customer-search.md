# Customer Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users find a customer by name on the Customers and Churn Risk pages via a `?q=` search that filters server-side across all pages.

**Architecture:** A pure `filterCardsByCompanyName` helper in `backend/platform/metrics/` is applied inside the two existing endpoints (`/customers/health-scores`, `/customers/churn-risk`) after the full card list is built and before `total`/pagination, so page counts reflect the filtered set. The frontend adds a no-JS GET-form `SearchBar` component on both server-rendered pages and threads `q` through the API client and pagination links.

**Tech Stack:** Encore.ts backend (vitest via `encore test`), Next.js 15 App Router frontend (server components, Tailwind, `ui/button`).

**Spec:** `docs/superpowers/specs/2026-08-04-customer-search-design.md`

## Global Constraints

- Search matches **case-insensitive substring on `company_name` only** — no other fields.
- Empty or whitespace-only `q` must behave exactly as no filter (existing behavior unchanged).
- `total` returned by both endpoints must be the **filtered** count.
- A new search always lands on page 1 (the search form submits only `q`, never `page`).
- Previous/Next links must preserve the active `q` (URL-encoded).
- Empty-state copy, exactly: `No customers match "<query>".` on /customers, `No companies match "<query>".` on /churn-risk.
- Churn-risk endpoint tests live in the existing `describe.skipIf(!process.env.RUN_ML_SERVICE_TESTS)` block (they need the ml-service; do not un-gate them).
- Frontend has no test runner — verification is `npx tsc --noEmit` in `frontend/`.
- Commit messages follow the repo's `type(scope): summary` convention.

---

### Task 1: Pure filter helper `filterCardsByCompanyName`

**Files:**
- Create: `backend/platform/metrics/filterCardsByCompanyName.ts`
- Test: `backend/platform/metrics/filterCardsByCompanyName.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `filterCardsByCompanyName<T extends { company_name: string }>(cards: T[], q: string | undefined): T[]` — exported named function; Task 2 imports it into `backend/platform/api.ts`.

- [ ] **Step 1: Write the failing test**

Create `backend/platform/metrics/filterCardsByCompanyName.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterCardsByCompanyName } from "./filterCardsByCompanyName";

const cards = [
  { company_name: "Acme Corp", other: 1 },
  { company_name: "Globex", other: 2 },
  { company_name: "acme labs", other: 3 },
];

describe("filterCardsByCompanyName", () => {
  it("matches case-insensitively on substring", () => {
    const result = filterCardsByCompanyName(cards, "ACME");
    expect(result.map((c) => c.company_name)).toEqual(["Acme Corp", "acme labs"]);
  });

  it("returns all cards for undefined, empty, and whitespace-only queries", () => {
    expect(filterCardsByCompanyName(cards, undefined)).toEqual(cards);
    expect(filterCardsByCompanyName(cards, "")).toEqual(cards);
    expect(filterCardsByCompanyName(cards, "   ")).toEqual(cards);
  });

  it("trims surrounding whitespace from the query", () => {
    const result = filterCardsByCompanyName(cards, "  globex  ");
    expect(result.map((c) => c.company_name)).toEqual(["Globex"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterCardsByCompanyName(cards, "zzz")).toEqual([]);
  });

  it("preserves the extra properties of matched cards", () => {
    const result = filterCardsByCompanyName(cards, "globex");
    expect(result).toEqual([{ company_name: "Globex", other: 2 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test metrics/filterCardsByCompanyName.test.ts`
Expected: FAIL — cannot find module `./filterCardsByCompanyName`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/platform/metrics/filterCardsByCompanyName.ts`:

```ts
export function filterCardsByCompanyName<T extends { company_name: string }>(
  cards: T[],
  q: string | undefined,
): T[] {
  const needle = (q ?? "").trim().toLowerCase();
  if (!needle) return cards;
  return cards.filter((c) => c.company_name.toLowerCase().includes(needle));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test metrics/filterCardsByCompanyName.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/platform/metrics/filterCardsByCompanyName.ts backend/platform/metrics/filterCardsByCompanyName.test.ts
git commit -m "feat(backend): add pure company-name card filter helper"
```

---

### Task 2: Wire `q` into both endpoints

**Files:**
- Modify: `backend/platform/api.ts` (imports block ~line 27; `CustomerHealthScoresParams` ~line 319; health-scores pagination ~lines 418–420; `CustomerChurnRiskParams` ~line 513; churn-risk pagination ~lines 551–553)
- Test: `backend/platform/api.test.ts` (append inside the existing `customerHealthScores` describe ending ~line 159, and inside the gated `customerChurnRisk` describe ending ~line 200)

**Interfaces:**
- Consumes: `filterCardsByCompanyName` from Task 1.
- Produces: both endpoints accept an optional `q` query param — `customerHealthScores({ page?, pageSize?, q? })` and `customerChurnRisk({ page?, pageSize?, q? })`. Response shapes unchanged; `total` becomes the filtered count. Task 3's fetch functions rely on the `q=` query-string name.

- [ ] **Step 1: Write the failing tests**

In `backend/platform/api.test.ts`, add inside the `describe("customerHealthScores", ...)` block (before its closing `});` at ~line 159):

```ts
  it("filters by company name case-insensitively with q, and total reflects the filtered count", async () => {
    await db.exec`
      INSERT INTO companies (id, name, industry, company_size, plan_tier, customer_stage, signup_date)
      VALUES ('CMP-0000Q', 'Zebra Search Target', 'other', 10, 'free', 'trial', CURRENT_DATE)
    `;
    try {
      const res = await customerHealthScores({ page: 1, pageSize: 25, q: "zebra search" });
      expect(res.total).toBe(1);
      expect(res.customers).toHaveLength(1);
      expect(res.customers[0].company_name).toBe("Zebra Search Target");
    } finally {
      await db.exec`DELETE FROM companies WHERE id = 'CMP-0000Q'`;
    }
  });

  it("treats a whitespace-only q as no filter", async () => {
    const unfiltered = await customerHealthScores({ page: 1, pageSize: 10 });
    const blank = await customerHealthScores({ page: 1, pageSize: 10, q: "   " });
    expect(blank.total).toBe(unfiltered.total);
  });
```

Add inside the gated `describe.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("customerChurnRisk", ...)` block (before its closing `});` at ~line 200):

```ts
  it("filters by company name with q and keeps probability-descending order", async () => {
    const all = await customerChurnRisk({ page: 1, pageSize: 100 });
    const target = all.companies[0].company_name;
    const res = await customerChurnRisk({ page: 1, pageSize: 100, q: target.slice(0, 4).toLowerCase() });
    expect(res.total).toBeGreaterThan(0);
    expect(res.total).toBeLessThanOrEqual(all.total);
    for (const c of res.companies) {
      expect(c.company_name.toLowerCase()).toContain(target.slice(0, 4).toLowerCase());
    }
    for (let i = 1; i < res.companies.length; i++) {
      expect(res.companies[i].churn_probability).toBeLessThanOrEqual(res.companies[i - 1].churn_probability);
    }
  });
```

- [ ] **Step 2: Run tests to verify the new health-scores tests fail**

Run: `cd backend && encore test api.test.ts`
Expected: the two new `customerHealthScores` tests FAIL (TypeScript error: `q` does not exist on `CustomerHealthScoresParams`, or filter not applied). Gated churn tests are skipped — that is expected.

- [ ] **Step 3: Implement**

In `backend/platform/api.ts`:

1. Add to the imports block (after the `computeRecommendedAction` import at ~line 27):

```ts
import { filterCardsByCompanyName } from "./metrics/filterCardsByCompanyName";
```

2. Add `q` to both param interfaces:

```ts
interface CustomerHealthScoresParams {
  page?: Query<number>;
  pageSize?: Query<number>;
  q?: Query<string>;
}
```

```ts
interface CustomerChurnRiskParams {
  page?: Query<number>;
  pageSize?: Query<number>;
  q?: Query<string>;
}
```

3. In `customerHealthScores`, replace:

```ts
    const total = allCards.length;
    const start = (page - 1) * pageSize;
    const customers = allCards.slice(start, start + pageSize);
```

with:

```ts
    const filtered = filterCardsByCompanyName(allCards, params.q);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const customers = filtered.slice(start, start + pageSize);
```

4. In `customerChurnRisk`, replace:

```ts
    const total = allCards.length;
    const start = (page - 1) * pageSize;
    const companies = allCards.slice(start, start + pageSize);
```

with:

```ts
    const filtered = filterCardsByCompanyName(allCards, params.q);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const companies = filtered.slice(start, start + pageSize);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test api.test.ts`
Expected: PASS, gated churn tests skipped. If the local ml-service is already running, also run `RUN_ML_SERVICE_TESTS=1 encore test api.test.ts` to exercise the churn filter test; if it is not running, skip that — do not start it for this task.

- [ ] **Step 5: Commit**

```bash
git add backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): support q search filter on health-scores and churn-risk endpoints"
```

---

### Task 3: Frontend API client + SearchBar component

**Files:**
- Modify: `frontend/lib/api.ts:23-27` (`getCustomerHealthScores`) and `frontend/lib/api.ts:35-39` (`getCustomerChurnRisk`)
- Create: `frontend/components/SearchBar.tsx`

**Interfaces:**
- Consumes: backend `q=` query param from Task 2.
- Produces:
  - `getCustomerHealthScores(page = 1, pageSize = 25, q?: string): Promise<CustomerHealthScoresResponse>`
  - `getCustomerChurnRisk(page = 1, pageSize = 25, q?: string): Promise<ChurnRiskResponse>`
  - `SearchBar({ action, query, placeholder }: { action: string; query: string; placeholder?: string })` — server-component-friendly, default export not used; named export `SearchBar`. Tasks 4–5 render it.

- [ ] **Step 1: Update the two fetch functions in `frontend/lib/api.ts`**

Replace `getCustomerHealthScores` with:

```ts
export async function getCustomerHealthScores(page = 1, pageSize = 25, q?: string): Promise<CustomerHealthScoresResponse> {
  const search = q && q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
  const res = await fetch(`${API}/customers/health-scores?page=${page}&pageSize=${pageSize}${search}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/health-scores failed: ${res.status}`);
  return res.json();
}
```

Replace `getCustomerChurnRisk` with:

```ts
export async function getCustomerChurnRisk(page = 1, pageSize = 25, q?: string): Promise<ChurnRiskResponse> {
  const search = q && q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
  const res = await fetch(`${API}/customers/churn-risk?page=${page}&pageSize=${pageSize}${search}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/churn-risk failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Create `frontend/components/SearchBar.tsx`**

```tsx
// frontend/components/SearchBar.tsx
import { Button } from "@/components/ui/button";

export function SearchBar({
  action,
  query,
  placeholder = "Search by company name…",
}: {
  action: string;
  query: string;
  placeholder?: string;
}) {
  return (
    <form action={action} method="get" className="flex items-center gap-2">
      <input
        type="text"
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        aria-label="Search by company name"
        className="h-8 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <Button type="submit" variant="outline">
        Search
      </Button>
      {query.trim() !== "" && (
        <a href={action} className="text-sm text-muted-foreground underline">
          Clear
        </a>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts frontend/components/SearchBar.tsx
git commit -m "feat(frontend): add q param to customer fetches and shared SearchBar component"
```

---

### Task 4: Customers page search wiring

**Files:**
- Modify: `frontend/app/customers/page.tsx` (whole file, shown below)

**Interfaces:**
- Consumes: `getCustomerHealthScores(page, pageSize, q)` and `SearchBar` from Task 3.
- Produces: `/customers?q=<text>` filters the grid; pagination preserves `q`.

- [ ] **Step 1: Rewrite the page**

Replace the contents of `frontend/app/customers/page.tsx` with:

```tsx
// frontend/app/customers/page.tsx
import { getCustomerHealthScores } from "@/lib/api";
import { CustomerCard } from "@/components/CustomerCard";
import { SearchBar } from "@/components/SearchBar";

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const { customers, total } = await getCustomerHealthScores(page, PAGE_SIZE, q);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qSuffix = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">SaaSPulse AI — Customer Intelligence</h1>

      <SearchBar action="/customers" query={q} />

      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No customers match &quot;{q}&quot;.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <CustomerCard key={c.company_id} customer={c} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <a
          href={`/customers?page=${page - 1}${qSuffix}`}
          aria-disabled={page <= 1}
          className={`text-sm underline ${page <= 1 ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          ← Previous
        </a>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <a
          href={`/customers?page=${page + 1}${qSuffix}`}
          aria-disabled={page >= totalPages}
          className={`text-sm underline ${page >= totalPages ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          Next →
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/customers/page.tsx
git commit -m "feat(frontend): add customer search to Customers page"
```

---

### Task 5: Churn Risk page search wiring + end-to-end verification

**Files:**
- Modify: `frontend/app/churn-risk/page.tsx` (whole file, shown below)

**Interfaces:**
- Consumes: `getCustomerChurnRisk(page, pageSize, q)` and `SearchBar` from Task 3.
- Produces: `/churn-risk?q=<text>` filters the grid; pagination preserves `q`.

- [ ] **Step 1: Rewrite the page**

Replace the contents of `frontend/app/churn-risk/page.tsx` with:

```tsx
// frontend/app/churn-risk/page.tsx
import { getCustomerChurnRisk } from "@/lib/api";
import { ChurnRiskCard } from "@/components/ChurnRiskCard";
import { SearchBar } from "@/components/SearchBar";

const PAGE_SIZE = 25;

export default async function ChurnRiskPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const { companies, total } = await getCustomerChurnRisk(page, PAGE_SIZE, q);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qSuffix = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">SaaSPulse AI — Churn Risk</h1>

      <SearchBar action="/churn-risk" query={q} />

      {companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No companies match &quot;{q}&quot;.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <ChurnRiskCard key={c.company_id} company={c} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <a
          href={`/churn-risk?page=${page - 1}${qSuffix}`}
          aria-disabled={page <= 1}
          className={`text-sm underline ${page <= 1 ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          ← Previous
        </a>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <a
          href={`/churn-risk?page=${page + 1}${qSuffix}`}
          aria-disabled={page >= totalPages}
          className={`text-sm underline ${page >= totalPages ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          Next →
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full backend test suite**

Run: `cd backend && encore test`
Expected: all tests pass (ml-gated tests skipped).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/churn-risk/page.tsx
git commit -m "feat(frontend): add customer search to Churn Risk page"
```

---

## After the plan

Deployment is out of scope for the tasks above: pushing `main` to origin triggers the existing Vercel (frontend) and Encore Cloud (backend) deploys per `DEPLOY.md`. Verify `/customers?q=` and `/churn-risk?q=` on the deployed preview after push.
