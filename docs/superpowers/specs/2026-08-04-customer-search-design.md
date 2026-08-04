# Customer Search — Design

**Date:** 2026-08-04
**Status:** Approved (Approach A)

## Goal

Let users quickly find a particular customer by name on the Customers page
(`/customers`) and the Churn Risk page (`/churn-risk`), instead of paging
through 25-card pages.

## Approach

Server-side search via an optional `q` query parameter on the two existing
endpoints, plus a shared GET-form search bar on both pages. No new endpoints,
no client-side state. Chosen over a dedicated search endpoint (duplicates
scoring logic) and client-side filtering (only sees the current page).

## Behavior

- User types a name fragment and presses the Search button (or Enter).
- The form submits a plain GET to the same page with `?q=<text>`, which
  resets pagination to page 1 (no `page` param in the form).
- The server filters the full result set case-insensitively by substring
  match on `company_name`, then paginates the filtered set. `total` (and
  therefore "Page X of Y") reflects the filtered count.
- Previous/Next links preserve the active `q`.
- When a query is active, a "Clear" link next to the form returns to the
  unfiltered page.
- If an active query has zero total matches, the page shows: `No customers match "<query>".`
  (Churn Risk page: `No companies match "<query>".`) Any other empty page (e.g., hand-edited
  out-of-range page URL) shows the generic fallback: `No customers found.` / `No companies found.`
- Empty or whitespace-only `q` behaves as no filter.

## Changes

### 1. Backend — `backend/platform/api.ts`

- Add `q?: Query<string>` to `CustomerHealthScoresParams` and
  `CustomerChurnRiskParams`.
- In both handlers, after building `allCards` and before computing
  `total`/slicing:
  ```ts
  const q = (params.q ?? "").trim().toLowerCase();
  const filtered = q
    ? allCards.filter((c) => c.company_name.toLowerCase().includes(q))
    : allCards;
  ```
  Paginate `filtered` instead of `allCards`.

### 2. API client — `frontend/lib/api.ts`

- `getCustomerHealthScores(page, pageSize, q?)` and
  `getCustomerChurnRisk(page, pageSize, q?)` append
  `&q=${encodeURIComponent(q)}` when `q` is a non-empty string.

### 3. New component — `frontend/components/SearchBar.tsx`

Server-component-friendly (no client JS):

- Props: `action: string` (page path), `query: string` (current `q`),
  `placeholder?: string`.
- Renders `<form action={action} method="get">` with a text input named
  `q` (defaultValue = current query), a Search submit button (existing
  `ui/button` styling), and — only when `query` is non-empty — a "Clear"
  link back to `action`.

### 4. Pages — `frontend/app/customers/page.tsx`, `frontend/app/churn-risk/page.tsx`

- Read `q` from `searchParams` alongside `page`.
- Pass `q` to the fetch function.
- Render `<SearchBar>` between the heading and the card grid.
- Append `&q=<encoded>` to Previous/Next links when a query is active.
- Render the empty-state message instead of the grid when the filtered
  list is empty.

## Error handling

No new failure modes: `q` is optional and sanitized by trim; an absent or
empty value is the existing behavior. Out-of-range pages already clamp via
existing `Math.max(1, ...)` and slice semantics (empty page, not an error).

## Testing

- Backend: extend the existing endpoint tests (if present) or verify via
  local Encore run — `q` filters case-insensitively, `total` reflects the
  filtered count, pagination slices the filtered set, empty `q` returns
  everything.
- Frontend: `tsc` type-check, then manual check locally or on the
  deployed preview.

## Out of scope

- Matching on plan tier, risk level, or other fields.
- Live/debounced search-as-you-type.
- Global search in the nav.
