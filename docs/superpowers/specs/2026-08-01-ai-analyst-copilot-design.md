# SaaSPulse AI — Phase 7: AI Analyst Copilot (Module 6)

Status: Approved
Date: 2026-08-01

## Goal

A natural-language chat assistant that answers questions about the business by calling
this project's own existing endpoints and metric functions as tools — never
recomputing metrics itself, never fabricating numbers. Same proven pattern as the
Healthcare Claims project's agentic Gemini chat: `POST /chat` (SSE) runs a
function-calling loop where the LLM decides which tool(s) to call, executes them
against real data, and synthesizes an answer.

## Architecture Note: Single Service, Not a Separate `copilot` Service

Phase 1's original foundation spec mentioned "later services (churn, copilot) call
`platform` via Encore's type-safe RPC" — implying separate Encore services. In actual
execution, Phase 6 (churn) was built directly inside the single `platform` service,
not as a separate service, and every phase since Phase 2 has done the same. Phase 7
follows this established, consistent practice: the copilot's endpoint and tool-wrapper
code live in `backend/platform/`, calling the existing pure functions and endpoint
logic directly (in-process function calls, not HTTP/RPC) — faster, simpler, and
consistent with 5 phases of real precedent over an early aspirational spec note.

## Model & SDK

`@google/genai`, `gemini-2.5-flash` primary with `gemini-2.0-flash` fallback on error
— identical to the Healthcare Claims project's working configuration. Thinking
disabled on 2.5 (`thinkingConfig: { thinkingBudget: 0 }`), matching that precedent.
Secret name `GeminiApiKey` (Encore secret, local-dev type only for now — deployment
remains deferred per the standing project decision since Phase 1).

**Before implementation starts**, the user needs to provide/configure a Gemini API
key for local testing (`encore secret set --type dev GeminiApiKey`), since Claude has
no access to obtain one.

## Tool Set (5 tools, all wrapping existing code — no new metric logic)

| Tool | Wraps | Params |
|---|---|---|
| `get_executive_overview` | Phase 2's `executiveOverview()` | none |
| `get_product_overview` | Phase 3's `productOverview()` | none |
| `get_customer_segments` | Phase 5's `customerSegments()` | none |
| `get_top_churn_risks` | Phase 6's `customerChurnRisk()` (already sorted desc) | `limit: number` (default 10, max 50) |
| `get_company_profile` | **new**, see below | `company_name: string` |

No `get_customer_health_scores` tool: Phase 5's segments already answer "how healthy
is my customer base" at the aggregate level, and per-company detail is covered by
`get_company_profile` — a separate paginated health-card dump would be redundant and
wasteful of both LLM context tokens and the Gemini free-tier quota.

## New Endpoint: `GET /companies/profile?name=`

Combines one company's health score, segment, and churn prediction into a single
view — reusing Phase 4/5/6's exact pure functions, just scoped to one company's rows
instead of the full active population, exactly the reusability those phases were
built for.

Lookup: case-insensitive exact match on `companies.name` first; if none, a
case-insensitive partial (`ILIKE '%name%'`) match, ordered by `c.id` for determinism
(matching every other multi-row fetch in this project) and taking the first result.
Calls
`ensureSegmented()`/`ensureChurnPredicted()` first (both already idempotent) to
guarantee segment/churn data exists, then reads the company's own `ml_predictions`
rows directly rather than recomputing.

```json
{
  "found": true,
  "company": {
    "id": "CMP-0042", "name": "Acme Corp", "industry": "...", "plan_tier": "...",
    "health": { "usage_score": 18, "adoption_score": 20, "support_score": 22,
      "revenue_score": 18, "overall_score": 78, "risk_level": "low",
      "recommended_action": "..." },
    "segment_label": "Power Users",
    "churn": { "probability": 0.08, "risk_level": "low",
      "primary_risk_driver": "...", "secondary_risk_driver": "...",
      "recommendation": "..." }
  }
}
```

`{ "found": false }` when no match — the LLM tells the user the company wasn't found
rather than fabricating a profile.

## Chat Mechanics

- **Stateless** (matching the Healthcare Claims precedent) — no new "conversations"
  table. The client resends up to the last 20 messages each turn.
- Max 4 rounds, 1 tool call per round — this project's 5-tool set answers virtually
  every question in 1-2 calls, simpler than Healthcare Claims' multi-source retrieval
  loop.
- `POST /chat`, SSE response, typed events:
  - `step` — `{"tool": "...", "args": {...}}` — fired when a tool is about to be
    called, so the UI can show "Checking churn risk..." style progress
  - `text` — `{"text": "..."}` — streamed answer text chunks
  - `error` — `{"message": "..."}` — Gemini failure after both models tried
  - `done` — `{}` — stream complete
- Model fallback: try `gemini-2.5-flash` first; on error, retry the same round with
  `gemini-2.0-flash`; if both fail, emit `error` and end the stream.
- System prompt instructs the model: answer only from tool results, never invent
  numbers, and clearly say when a company/question can't be resolved from available
  tools.

## Testing Strategy (the one deliberate exception to zero-mocking, resolved without mocking)

Gemini's free tier is rate-limited (~20 requests/day/model). Rather than introducing
this project's first mock, the test suite is designed to make minimal real Gemini
calls:
- The 5 tool-wrapper functions themselves get thorough, real-data tests with **no
  Gemini involved at all** — they're just thin adapters over already-tested
  endpoints/functions, so their correctness doesn't need an LLM in the loop.
- The end-to-end chat loop gets exactly 2 real Gemini-backed tests: one question
  answerable with a single tool call, one requiring two different tool calls in
  sequence — enough to prove the loop, tool-dispatch, and SSE event shapes work
  end-to-end, without burning meaningful quota on every test run.
- **Concrete gating mechanism** (so "run deliberately" isn't just an intention):
  both tests are wrapped in `describe.skipIf(!process.env.RUN_GEMINI_TESTS)(...)`
  in `backend/platform/chat.test.ts`. A plain `encore test` (the command every prior
  phase's reviewers and this phase's own non-chat tests use) skips them
  automatically — they only run via `RUN_GEMINI_TESTS=1 encore test chat.test.ts`,
  invoked deliberately, not as a side effect of running the full suite.

## Frontend: `/copilot` — the First Client Component in This Project

Every page built in Phases 2-6 is a pure Server Component. SSE streaming requires
client-side `fetch` + `ReadableStream` reading, which Server Components cannot do —
this is a deliberate, necessary exception, not a stylistic drift. Simple chat UI using
the existing shadcn/ui `Card` components for visual consistency: a scrollable message
list (user messages right-aligned, assistant messages left-aligned), a text input +
send button, and `step` events rendered as small transient "Checking X..." status
lines above the streaming answer. Plain text rendering (`whitespace-pre-wrap`), no
markdown parsing — keeps the dependency footprint unchanged, matching this project's
minimal-dependency convention.

## Definition of Done

- `POST /chat` runs a real Gemini function-calling loop against the 5 tools, with
  model fallback and typed SSE events
- `GET /companies/profile?name=` returns a real combined health/segment/churn view
  for one company, reusing Phase 4/5/6's pure functions — no new metric logic
- Tool-wrapper functions are thoroughly tested with real data, no Gemini involved
- Exactly 2 real end-to-end Gemini-backed tests prove the full loop works
- `/copilot` page renders a working chat UI, verified via real browser interaction
  (not just `tsc`)
- Full backend suite passes (Gemini-backed tests included, run deliberately, not on
  every incidental `encore test` invocation during unrelated work); frontend
  `tsc --noEmit` clean
