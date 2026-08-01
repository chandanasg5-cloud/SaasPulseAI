# SaaSPulse AI — Phase 7: AI Analyst Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Gemini function-calling chat assistant that answers business questions by calling this project's existing endpoints/metric functions as tools — never recomputing metrics, never fabricating numbers.

**Architecture:** A pure, provider-agnostic chat loop (`agent.ts`) drives rounds of Gemini calls, dispatching tool calls to real in-process functions (`chatTools.ts`) that wrap Phases 2-6's already-built endpoints, plus one new single-company lookup. `chat.ts` exposes this as an SSE endpoint. The loop itself is unit-tested via dependency injection (a scripted fake model) with zero Gemini calls; only 2 explicitly-gated end-to-end tests touch the real Gemini API.

**Tech Stack:** `@google/genai`, Encore.ts `api.raw` (SSE), Next.js 15 Client Component (the first in this project — SSE requires client-side `fetch`+`ReadableStream`, which Server Components cannot do).

## Global Constraints

- **Anti-fabrication**: the system prompt instructs the model to answer only from tool results, never invent numbers, and say plainly when something (e.g. an unmatched company) can't be resolved.
- **No new metric logic**: all 5 tools wrap existing Phase 2-6 code (`executiveOverview()`, `productOverview()`, `customerSegments()`, `customerChurnRisk()`, and the 5 pure health-scoring functions reused for the new company-profile lookup) — the only new business logic is the single-company profile combiner.
- **Single service**: everything lives in `backend/platform/`, matching every phase since Phase 2 — no separate `copilot` Encore service, despite Phase 1's early aspirational note about one.
- **Model config**: `gemini-2.5-flash` primary, `gemini-2.0-flash` fallback on error, `thinkingConfig: { thinkingBudget: 0 }` on 2.5 only (2.0-era models reject `thinkingConfig`). Secret name `GeminiApiKey`.
- **Loop limits**: `MAX_ROUNDS = 4`, `MAX_CALLS_PER_ROUND = 1`, `HISTORY_LIMIT = 20`.
- **Stateless chat**: no new "conversations" table — the client resends up to the last 20 messages each turn.
- **SSE events**: `step` (`{tool, label}`), `text` (`{text}` delta), `error` (`{message}`), `done` (`{}`) — the stream always ends with `done`, even after an error.
- **Testing gate for real-Gemini tests**: `describe.skipIf(!process.env.RUN_GEMINI_TESTS)(...)` in `chat.test.ts` — a plain `encore test` never touches the real Gemini API; only `RUN_GEMINI_TESTS=1 encore test chat.test.ts` does.
- **Company lookup determinism**: case-insensitive exact match first, then case-insensitive partial (`ILIKE`) match ordered by `c.id`, taking the first result — matching every other multi-row fetch in this project's determinism convention.

**Before starting implementation**, the user needs to configure a Gemini API key for local testing: `cd backend && encore secret set --type dev GeminiApiKey` (paste the key when prompted).

---

## File Structure

**Backend (`backend/platform/`):**
- `agent.ts` (new) — pure, injectable chat loop (`chatStream`, types)
- `toolspec.ts` (new) — tool declarations, argument validation, step labels (no DB/network — pure metadata)
- `companyProfile.ts` (new) — single-company health+segment+churn lookup
- `chatFormat.ts` (new) — pure functions formatting each tool's raw data into text for the model
- `chatTools.ts` (new) — executor dispatching tool names to real functions
- `gemini.ts` (new) — `@google/genai` adapter implementing the loop's `ModelClient` interface
- `chat.ts` (new) — `POST /chat` SSE endpoint, request parsing
- `api.ts` (modify) — add `companyProfile` endpoint
- `package.json` (modify) — add `@google/genai`

**Frontend (`frontend/`):**
- `app/copilot/page.tsx` (new) — the chat UI, a Client Component

---

### Task 1: Tool declarations, validation, step labels (`toolspec.ts`)

**Files:**
- Create: `backend/platform/toolspec.ts`
- Create: `backend/platform/toolspec.test.ts`

**Interfaces:**
- Produces: `ToolDeclaration` type, `toolDeclarations: ToolDeclaration[]`,
  `validateToolArgs(name: string, args: Record<string, unknown>): {ok:true}|{ok:false,error:string}`,
  `stepLabel(name: string, args: Record<string, unknown>): string` — consumed by Task 2
  (`stepLabel`), Task 6 (`toolDeclarations`), and Task 5 (`validateToolArgs`).

No DB, no network, no Encore imports — pure metadata, unit-testable in isolation.
This has no dependency on any other task, so it comes first.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/toolspec.test.ts
import { describe, it, expect } from "vitest";
import { toolDeclarations, validateToolArgs, stepLabel } from "./toolspec";

describe("toolDeclarations", () => {
  it("declares exactly the 5 expected tools", () => {
    const names = toolDeclarations.map((d) => d.name);
    expect(names).toEqual([
      "get_executive_overview", "get_product_overview", "get_customer_segments",
      "get_top_churn_risks", "get_company_profile",
    ]);
  });
});

describe("validateToolArgs", () => {
  it("accepts a known tool with no required args", () => {
    expect(validateToolArgs("get_executive_overview", {})).toEqual({ ok: true });
  });

  it("accepts get_company_profile with a non-empty company_name", () => {
    expect(validateToolArgs("get_company_profile", { company_name: "Acme" })).toEqual({ ok: true });
  });

  it("rejects get_company_profile with a missing company_name", () => {
    expect(validateToolArgs("get_company_profile", {}).ok).toBe(false);
  });

  it("rejects get_company_profile with an empty-string company_name", () => {
    expect(validateToolArgs("get_company_profile", { company_name: "   " }).ok).toBe(false);
  });

  it("rejects an unknown tool name", () => {
    expect(validateToolArgs("delete_everything", {}).ok).toBe(false);
  });
});

describe("stepLabel", () => {
  it("labels each of the 5 tools distinctly", () => {
    expect(stepLabel("get_executive_overview", {})).toBe("Checking executive overview");
    expect(stepLabel("get_product_overview", {})).toBe("Checking product analytics");
    expect(stepLabel("get_customer_segments", {})).toBe("Checking customer segments");
    expect(stepLabel("get_top_churn_risks", {})).toBe("Checking churn risk");
    expect(stepLabel("get_company_profile", { company_name: "Acme" })).toBe("Looking up Acme");
  });

  it("falls back gracefully for an unknown tool", () => {
    expect(stepLabel("mystery_tool", {})).toBe("Running mystery_tool");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test toolspec.test.ts`
Expected: FAIL — `./toolspec` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/toolspec.ts
// Pure tool metadata shared by the agent loop, the Gemini client, and the
// executor. No encore/db imports — unit-testable without a database.

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: "STRING" | "NUMBER"; description: string }>;
    required: string[];
  };
}

export const toolDeclarations: ToolDeclaration[] = [
  {
    name: "get_executive_overview",
    description:
      "Get executive KPIs and charts: MRR, ARR, revenue growth, CAC, CLV, churn rate, NRR, " +
      "revenue trend, MRR waterfall, customer growth, subscription breakdown by plan tier.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_product_overview",
    description:
      "Get product usage KPIs: DAU/WAU/MAU, stickiness, feature adoption rate, the 5-stage " +
      "activation funnel, feature usage ranking, engagement trend, cohort retention.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_customer_segments",
    description:
      "Get the 4 customer personas (Power Users, Expansion Opportunity, High Value Low " +
      "Engagement, At Risk) with company counts, percentages, and average sub-scores for each.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_top_churn_risks",
    description:
      "Get the companies with the highest predicted churn probability, sorted highest-risk " +
      "first, with risk level, top risk drivers, and a recommended action for each.",
    parameters: {
      type: "OBJECT",
      properties: { limit: { type: "NUMBER", description: "How many companies to return (default 10, max 50)" } },
      required: [],
    },
  },
  {
    name: "get_company_profile",
    description:
      "Look up ONE specific company by name and get its health score, customer segment, and churn risk together.",
    parameters: {
      type: "OBJECT",
      properties: { company_name: { type: "STRING", description: "The company name to look up, e.g. 'Acme Corp'" } },
      required: ["company_name"],
    },
  },
];

export function validateToolArgs(
  name: string,
  args: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const decl = toolDeclarations.find((d) => d.name === name);
  if (!decl) return { ok: false, error: `unknown tool ${name}` };
  for (const req of decl.parameters.required) {
    const v = args[req];
    if (typeof v !== "string" || v.trim() === "") {
      return { ok: false, error: `missing or empty argument ${req} for ${name}` };
    }
  }
  return { ok: true };
}

export function stepLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "get_executive_overview": return "Checking executive overview";
    case "get_product_overview": return "Checking product analytics";
    case "get_customer_segments": return "Checking customer segments";
    case "get_top_churn_risks": return "Checking churn risk";
    case "get_company_profile": {
      const company = typeof args.company_name === "string" ? args.company_name : "?";
      return `Looking up ${company}`;
    }
    default:
      return `Running ${name}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test toolspec.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/toolspec.ts backend/platform/toolspec.test.ts
git commit -m "feat(backend): add chat tool declarations, validation, and step labels"
```

---

### Task 2: Pure chat loop (`agent.ts`)

**Files:**
- Create: `backend/platform/agent.ts`
- Create: `backend/platform/agent.test.ts`

**Interfaces:**
- Consumes: `stepLabel` from `./toolspec` (Task 1).
- Produces: `ChatMessage`, `AgentEvent`, `FunctionCall`, `GenPart`, `GenContent`, `RoundChunk`, `ModelClient`, `ToolRunner` types; `MAX_ROUNDS`, `MAX_CALLS_PER_ROUND`, `HISTORY_LIMIT` constants; `chatStream(history: ChatMessage[], model: ModelClient, runTool: ToolRunner): AsyncGenerator<AgentEvent>` — consumed by Tasks 6 and 7.

This is a provider-agnostic control-flow loop with the model and tool executor both **injected** — this lets the loop's own round-management, history-truncation, and tool-dispatch logic get full, fast, deterministic unit test coverage via a scripted fake model, with zero real Gemini calls. This is a different (and legitimate) testing concern from "does this integrate with the real Gemini API" — that gets proven separately and sparingly in Task 7.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/agent.test.ts
import { describe, it, expect } from "vitest";
import {
  chatStream, MAX_ROUNDS, HISTORY_LIMIT,
  type AgentEvent, type ChatMessage, type GenContent, type ModelClient, type RoundChunk, type ToolRunner,
} from "./agent";

function fakeModel(rounds: RoundChunk[][]): ModelClient & { seen: GenContent[][] } {
  const seen: GenContent[][] = [];
  return {
    seen,
    async *streamRound(contents: GenContent[]) {
      seen.push(structuredClone(contents));
      for (const chunk of rounds.shift() ?? [{ text: "fallback answer" }]) yield chunk;
    },
  };
}

const echoTool: ToolRunner = async (name, args) => `${name}:${JSON.stringify(args)}`;

async function drain(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("chatStream", () => {
  it("streams a plain text answer when the model calls no tools", async () => {
    const model = fakeModel([[{ text: "Hello " }, { text: "there." }]]);
    const events = await drain(chatStream([{ role: "user", text: "hi" }], model, echoTool));
    expect(events).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "there." },
    ]);
    expect(model.seen.length).toBe(1);
  });

  it("runs a tool round-trip: step event, result fed back, final answer", async () => {
    const model = fakeModel([
      [{ functionCalls: [{ name: "get_executive_overview", args: {} }] }],
      [{ text: "MRR is $50,000." }],
    ]);
    const events = await drain(chatStream([{ role: "user", text: "what's our MRR?" }], model, echoTool));
    expect(events[0]).toEqual({ type: "step", tool: "get_executive_overview", label: "Checking executive overview" });
    expect(events[1]).toEqual({ type: "text", text: "MRR is $50,000." });

    const round2 = model.seen[1];
    const flat = JSON.stringify(round2);
    expect(flat).toContain("functionCall");
    expect(flat).toContain("functionResponse");
    expect(flat).toContain("get_executive_overview");
  });

  it("feeds tool-runner exceptions back to the model as error output instead of throwing", async () => {
    const failingTool: ToolRunner = async () => {
      throw new Error("boom");
    };
    const model = fakeModel([
      [{ functionCalls: [{ name: "get_company_profile", args: { company_name: "Acme" } }] }],
      [{ text: "I couldn't look that up." }],
    ]);
    const events = await drain(chatStream([{ role: "user", text: "tell me about Acme" }], model, failingTool));
    expect(events.at(-1)).toEqual({ type: "text", text: "I couldn't look that up." });
    const round2Flat = JSON.stringify(model.seen[1]);
    expect(round2Flat).toContain("Error: tool failed: boom");
  });

  it("stops calling tools on the last round and asks the model to answer now", async () => {
    const rounds: RoundChunk[][] = [];
    for (let i = 0; i < MAX_ROUNDS - 1; i++) {
      rounds.push([{ functionCalls: [{ name: "get_executive_overview", args: {} }] }]);
    }
    rounds.push([{ text: "Final answer from gathered info." }]);
    const model = fakeModel(rounds);
    const events = await drain(chatStream([{ role: "user", text: "loop test" }], model, echoTool));
    expect(events.at(-1)).toEqual({ type: "text", text: "Final answer from gathered info." });
    expect(model.seen.length).toBe(MAX_ROUNDS);
    const lastRoundFlat = JSON.stringify(model.seen[MAX_ROUNDS - 1]);
    expect(lastRoundFlat).toContain("Answer now from the information already gathered");
  });

  it("rejects extra tool calls beyond MAX_CALLS_PER_ROUND with an error response, still processes the first", async () => {
    const model = fakeModel([
      [{ functionCalls: [
        { name: "get_executive_overview", args: {} },
        { name: "get_product_overview", args: {} },
      ] }],
      [{ text: "done" }],
    ]);
    const events = await drain(chatStream([{ role: "user", text: "two things" }], model, echoTool));
    const stepEvents = events.filter((e) => e.type === "step");
    expect(stepEvents).toHaveLength(1);
    expect(stepEvents[0]).toEqual({ type: "step", tool: "get_executive_overview", label: "Checking executive overview" });
    const round2Flat = JSON.stringify(model.seen[1]);
    expect(round2Flat).toContain("too many tool calls");
  });

  it("truncates history to HISTORY_LIMIT and drops a leading model turn the cut exposes", async () => {
    const history: ChatMessage[] = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "model") as "user" | "model",
      text: `msg ${i}`,
    }));
    // slice(-20) of a 21-length array drops index 0 ("user"), leaving index 1 ("model")
    // first, which the code must then also shift off so the sequence starts with "user".
    const model = fakeModel([[{ text: "ok" }]]);
    await drain(chatStream(history, model, echoTool));
    const sent = model.seen[0];
    expect(sent.length).toBe(HISTORY_LIMIT - 1);
    expect(sent[0].role).toBe("user");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test agent.test.ts`
Expected: FAIL — `./agent` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/agent.ts
import { stepLabel } from "./toolspec";

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export type AgentEvent =
  | { type: "step"; tool: string; label: string }
  | { type: "text"; text: string };

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GenPart {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: { name: string; response: { output: string } };
}

export interface GenContent {
  role: "user" | "model";
  parts: GenPart[];
}

export interface RoundChunk {
  text?: string;
  functionCalls?: FunctionCall[];
}

export interface ModelClient {
  streamRound(contents: GenContent[]): AsyncGenerator<RoundChunk>;
}

export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;

export const MAX_ROUNDS = 4;
export const MAX_CALLS_PER_ROUND = 1;
export const HISTORY_LIMIT = 20;

// One agent conversation: streams model rounds, executes tool calls between
// rounds, and yields UI events. The model client and tool runner are injected
// so the loop is unit-testable without network or database.
export async function* chatStream(
  history: ChatMessage[],
  model: ModelClient,
  runTool: ToolRunner,
): AsyncGenerator<AgentEvent> {
  // Truncate, then drop any leading model turns the cut exposed — Gemini
  // expects conversations to open with a user message.
  const recent = history.slice(-HISTORY_LIMIT);
  while (recent.length > 0 && recent[0].role === "model") recent.shift();
  const contents: GenContent[] = recent.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const isLastRound = round === MAX_ROUNDS;
    if (isLastRound) {
      contents.push({
        role: "user",
        parts: [{ text: "Answer now from the information already gathered. Do not call any more tools." }],
      });
    }

    let roundText = "";
    const calls: FunctionCall[] = [];
    for await (const chunk of model.streamRound(contents)) {
      if (chunk.text) {
        roundText += chunk.text;
        yield { type: "text", text: chunk.text };
      }
      if (chunk.functionCalls && !isLastRound) calls.push(...chunk.functionCalls);
    }
    if (calls.length === 0) return;

    const modelParts: GenPart[] = [];
    if (roundText) modelParts.push({ text: roundText });
    for (const c of calls) modelParts.push({ functionCall: c });
    contents.push({ role: "model", parts: modelParts });

    const responseParts: GenPart[] = [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      if (i >= MAX_CALLS_PER_ROUND) {
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { output: "Error: too many tool calls in one round; use at most 1." },
          },
        });
        continue;
      }
      yield { type: "step", tool: call.name, label: stepLabel(call.name, call.args) };
      let output: string;
      try {
        output = await runTool(call.name, call.args);
      } catch (err) {
        output = `Error: tool failed: ${err instanceof Error ? err.message : "unknown error"}`;
      }
      responseParts.push({ functionResponse: { name: call.name, response: { output } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test agent.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/agent.ts backend/platform/agent.test.ts
git commit -m "feat(backend): add pure injectable chat loop"
```

---

### Task 3: Single-company profile lookup (`companyProfile.ts`)

**Files:**
- Create: `backend/platform/companyProfile.ts`
- Create: `backend/platform/companyProfile.test.ts`
- Modify: `backend/platform/api.ts`

**Interfaces:**
- Consumes: `ensureSeeded` from `./seed`; `ensureSegmented` from `./segmentation`;
  `ensureChurnPredicted` from `./churnPrediction`; `computeUsageScore`,
  `computeFeatureAdoptionScore`, `computeSupportScore`, `computeRevenueScore` (Phase 4);
  `computeHealthScore`, `computeRecommendedAction` (Phase 4); `CompanyEventRow`,
  `SupportTicketRow`, `UserRow`, `ProductEventRow` from `./metrics/types`.
- Produces: `CompanyProfile`, `CompanyProfileResult` types;
  `getCompanyProfile(companyName: string): Promise<CompanyProfileResult>` — consumed
  by Task 5 (`chatTools.ts`) and this task's own `api.ts` endpoint.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/companyProfile.test.ts
import { describe, it, expect } from "vitest";
import { getCompanyProfile } from "./companyProfile";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("getCompanyProfile", () => {
  it("returns found:false for a company name with no match", async () => {
    await ensureSeeded();
    const result = await getCompanyProfile("Definitely Not A Real Company Name XYZ123");
    expect(result.found).toBe(false);
  });

  it("finds a real company by exact name (case-insensitive) and returns a full profile", async () => {
    await ensureSeeded();
    const row = await db.queryRow<{ name: string }>`SELECT name FROM companies ORDER BY id LIMIT 1`;
    const result = await getCompanyProfile(row!.name.toUpperCase());
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.company.name).toBe(row!.name);
      expect(result.company.health.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.company.health.overall_score).toBeLessThanOrEqual(100);
      expect(["low", "medium", "high"]).toContain(result.company.health.risk_level);
    }
  });

  it("finds a real company by partial name match", async () => {
    await ensureSeeded();
    const row = await db.queryRow<{ name: string }>`SELECT name FROM companies ORDER BY id LIMIT 1`;
    const partial = row!.name.slice(0, Math.max(3, Math.floor(row!.name.length / 2)));
    const result = await getCompanyProfile(partial);
    expect(result.found).toBe(true);
  });

  it("returns null segment_label and churn for a churned company", async () => {
    await ensureSeeded();
    const churned = await db.queryRow<{ name: string }>`
      SELECT c.name FROM companies c
      JOIN subscriptions s ON s.company_id = c.id
      WHERE s.status = 'canceled' AND s.end_date <= CURRENT_DATE
      ORDER BY c.id LIMIT 1
    `;
    const result = await getCompanyProfile(churned!.name);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.company.segment_label).toBeNull();
      expect(result.company.churn).toBeNull();
    }
  });

  it("returns real segment_label and churn data for an active company", async () => {
    await ensureSeeded();
    const active = await db.queryRow<{ name: string }>`
      SELECT c.name FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
      ORDER BY c.id LIMIT 1
    `;
    const result = await getCompanyProfile(active!.name);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(typeof result.company.segment_label).toBe("string");
      expect(result.company.churn).not.toBeNull();
      if (result.company.churn) {
        expect(result.company.churn.probability).toBeGreaterThanOrEqual(0);
        expect(result.company.churn.probability).toBeLessThanOrEqual(1);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test companyProfile.test.ts`
Expected: FAIL — `./companyProfile` module not found.

**This test requires the real ml-service running** (`get_customer_segments`/churn data
come from `ensureSegmented()`/`ensureChurnPredicted()`, both of which call the real
ml-service): `cd ml-service && .venv/bin/uvicorn main:app --port 8001 &` — verify
with `curl -s http://127.0.0.1:8001/health`.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/companyProfile.ts
import { db } from "./db";
import { ensureSeeded } from "./seed";
import { ensureSegmented } from "./segmentation";
import { ensureChurnPredicted } from "./churnPrediction";
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeHealthScore } from "./metrics/healthScore";
import { computeRecommendedAction } from "./metrics/recommendedAction";
import type { CompanyEventRow, SupportTicketRow, UserRow, ProductEventRow } from "./metrics/types";

interface CompanyMatchRow {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  plan_name: string;
  status: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  health: {
    usage_score: number;
    adoption_score: number;
    support_score: number;
    revenue_score: number;
    overall_score: number;
    risk_level: string;
    recommended_action: string;
  };
  segment_label: string | null;
  churn: {
    probability: number;
    risk_level: string;
    primary_risk_driver: string;
    secondary_risk_driver: string;
    recommendation: string;
  } | null;
}

export type CompanyProfileResult = { found: true; company: CompanyProfile } | { found: false };

export async function getCompanyProfile(companyName: string): Promise<CompanyProfileResult> {
  await ensureSeeded();

  let match = await db.queryRow<CompanyMatchRow>`
    SELECT c.id, c.name, c.industry, c.plan_tier,
      COALESCE(s.plan_name, 'none') AS plan_name,
      COALESCE(s.status, 'none') AS status
    FROM companies c
    LEFT JOIN subscriptions s ON s.company_id = c.id
    WHERE LOWER(c.name) = LOWER(${companyName})
    ORDER BY c.id
    LIMIT 1
  `;

  if (!match) {
    match = await db.queryRow<CompanyMatchRow>`
      SELECT c.id, c.name, c.industry, c.plan_tier,
        COALESCE(s.plan_name, 'none') AS plan_name,
        COALESCE(s.status, 'none') AS status
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE c.name ILIKE ${"%" + companyName + "%"}
      ORDER BY c.id
      LIMIT 1
    `;
  }

  if (!match) return { found: false };

  const now = new Date();

  const users: UserRow[] = [];
  for await (const r of db.query<UserRow>`
    SELECT id, company_id, first_login_at, created_at FROM users WHERE company_id = ${match.id}
  `) {
    users.push(r);
  }

  const events: CompanyEventRow[] = [];
  for await (const r of db.query<CompanyEventRow>`
    SELECT company_id, user_id, feature_name, "timestamp" FROM product_events WHERE company_id = ${match.id}
  `) {
    events.push(r);
  }
  const productEventRows: ProductEventRow[] = events.map((e) => ({
    user_id: e.user_id,
    feature_name: e.feature_name,
    timestamp: e.timestamp,
  }));

  const tickets: SupportTicketRow[] = [];
  for await (const r of db.query<SupportTicketRow>`
    SELECT company_id, priority, created_at FROM support_tickets WHERE company_id = ${match.id}
  `) {
    tickets.push(r);
  }

  const usageScore = computeUsageScore(users, productEventRows, now);
  const adoptionScore = computeFeatureAdoptionScore(productEventRows, now);
  const supportScore = computeSupportScore(tickets, now);
  const revenueScore = computeRevenueScore({ plan_name: match.plan_name, status: match.status });
  const health = computeHealthScore(usageScore, adoptionScore, supportScore, revenueScore);
  const recommendedAction = computeRecommendedAction(health);

  await ensureSegmented();
  await ensureChurnPredicted();

  const segmentRow = await db.queryRow<{ segment_label: string }>`
    SELECT segment_label FROM ml_predictions
    WHERE company_id = ${match.id} AND prediction_type = 'segment'
  `;

  const churnRow = await db.queryRow<{ churn_probability: number; recommendation: string; main_drivers: string }>`
    SELECT churn_probability::float AS churn_probability, recommendation, main_drivers::text AS main_drivers
    FROM ml_predictions
    WHERE company_id = ${match.id} AND prediction_type = 'churn_probability'
  `;

  let churn: CompanyProfile["churn"] = null;
  if (churnRow) {
    const drivers = JSON.parse(churnRow.main_drivers);
    churn = {
      probability: churnRow.churn_probability,
      risk_level: drivers.risk_level,
      primary_risk_driver: drivers.primary_risk_driver,
      secondary_risk_driver: drivers.secondary_risk_driver,
      recommendation: churnRow.recommendation,
    };
  }

  return {
    found: true,
    company: {
      id: match.id,
      name: match.name,
      industry: match.industry,
      plan_tier: match.plan_tier,
      health: {
        usage_score: health.usage_score,
        adoption_score: health.adoption_score,
        support_score: health.support_score,
        revenue_score: health.revenue_score,
        overall_score: health.overall_score,
        risk_level: health.risk_level,
        recommended_action: recommendedAction,
      },
      segment_label: segmentRow?.segment_label ?? null,
      churn,
    },
  };
}
```

Add `import { getCompanyProfile, type CompanyProfileResult } from "./companyProfile";`
near the other imports at the top of `backend/platform/api.ts`, then append to the end
of that file:

```typescript
interface CompanyProfileParams {
  name: Query<string>;
}

export const companyProfile = api(
  { method: "GET", path: "/companies/profile", expose: true },
  async (params: CompanyProfileParams): Promise<CompanyProfileResult> => {
    return getCompanyProfile(params.name);
  },
);
```

(`Query` is already imported in `api.ts` from `encore.dev/api` — reuse it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test companyProfile.test.ts`
Expected: PASS, all 5 tests. (Requires ml-service on port 8001 and Docker/Postgres both running.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/companyProfile.ts backend/platform/companyProfile.test.ts backend/platform/api.ts
git commit -m "feat(backend): add single-company profile lookup and endpoint"
```

---

### Task 4: Tool-output text formatters (`chatFormat.ts`)

**Files:**
- Create: `backend/platform/chatFormat.ts`
- Create: `backend/platform/chatFormat.test.ts`

**Interfaces:**
- Produces: `formatExecutiveOverview`, `formatProductOverview`, `formatCustomerSegments`,
  `formatChurnRisks`, `formatCompanyProfile` — each a pure function taking one of the
  existing endpoints'/`getCompanyProfile`'s response shape and returning a concise,
  readable text string for the model to reason over. Consumed by Task 5 (`chatTools.ts`).

Each formatter declares its own minimal local parameter-shape interface (matching the
fields it reads) rather than importing types from `api.ts`/`companyProfile.ts` — this
keeps the formatter file decoupled and independently testable with plain object
literals, at the cost of a small amount of duplicated shape description. This is a
deliberate, display-only exception; it does not duplicate any business logic.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/chatFormat.test.ts
import { describe, it, expect } from "vitest";
import {
  formatExecutiveOverview, formatProductOverview, formatCustomerSegments,
  formatChurnRisks, formatCompanyProfile,
} from "./chatFormat";

describe("formatExecutiveOverview", () => {
  it("includes MRR, ARR, growth, customer count, churn, and NRR", () => {
    const text = formatExecutiveOverview({
      kpis: {
        mrr: 50000, arr: 600000, revenue_growth_pct: 5.2, customer_count: 774,
        cac: 120.5, clv: 2400.75, churn_rate_pct: 2.1, nrr_pct: 108.3,
      },
    });
    expect(text).toContain("$50000.00");
    expect(text).toContain("$600000.00");
    expect(text).toContain("5.2%");
    expect(text).toContain("774");
    expect(text).toContain("2.1%");
    expect(text).toContain("108.3%");
  });
});

describe("formatProductOverview", () => {
  it("includes DAU/WAU/MAU and the funnel stages", () => {
    const text = formatProductOverview({
      kpis: { dau: 100, wau: 400, mau: 900, stickiness_pct: 11.1, feature_adoption_pct: 42.5 },
      funnel: [
        { stage: "signup", count: 1000 },
        { stage: "first_login", count: 800 },
      ],
    });
    expect(text).toContain("DAU: 100");
    expect(text).toContain("WAU: 400");
    expect(text).toContain("MAU: 900");
    expect(text).toContain("signup: 1000");
    expect(text).toContain("first_login: 800");
  });
});

describe("formatCustomerSegments", () => {
  it("includes each segment's label and count", () => {
    const text = formatCustomerSegments({
      segments: [
        { segment_label: "Power Users", company_count: 100, pct_of_total: 25,
          avg_usage_score: 20, avg_adoption_score: 19, avg_support_score: 18,
          avg_revenue_score: 21, avg_seat_penetration_score: 20 },
      ],
    });
    expect(text).toContain("Power Users: 100 companies (25.0%)");
  });
});

describe("formatChurnRisks", () => {
  it("lists companies with probability, risk level, and drivers", () => {
    const text = formatChurnRisks({
      companies: [
        { company_name: "Acme Corp", churn_probability: 0.62, risk_level: "high",
          primary_risk_driver: "Short Tenure", secondary_risk_driver: "Weak Feature Adoption",
          recommendation: "Urgent: schedule a call" },
      ],
      total: 774,
    });
    expect(text).toContain("Acme Corp: 62% churn probability (high risk)");
    expect(text).toContain("Short Tenure, Weak Feature Adoption");
    expect(text).toContain("of 774 total");
  });

  it("returns a clear message for an empty list", () => {
    expect(formatChurnRisks({ companies: [], total: 0 })).toBe("No companies with churn predictions found.");
  });
});

describe("formatCompanyProfile", () => {
  it("returns a not-found message when found is false", () => {
    expect(formatCompanyProfile({ found: false })).toBe("No company found matching that name.");
  });

  it("formats a full profile including churn data", () => {
    const text = formatCompanyProfile({
      found: true,
      company: {
        name: "Acme Corp", industry: "Software", plan_tier: "enterprise",
        health: { overall_score: 78, risk_level: "low", recommended_action: "Maintain touchpoints" },
        segment_label: "Power Users",
        churn: { probability: 0.08, risk_level: "low", primary_risk_driver: "Low Support Burden",
          secondary_risk_driver: "High Plan Value", recommendation: "Monitor for renewal risk" },
      },
    });
    expect(text).toContain("Acme Corp (Software, enterprise plan)");
    expect(text).toContain("78/100 (low risk)");
    expect(text).toContain("Segment: Power Users");
    expect(text).toContain("8% (low)");
  });

  it("notes churn/segment as unavailable for a company with neither", () => {
    const text = formatCompanyProfile({
      found: true,
      company: {
        name: "Old Co", industry: "Retail", plan_tier: "free",
        health: { overall_score: 30, risk_level: "high", recommended_action: "..." },
        segment_label: null,
        churn: null,
      },
    });
    expect(text).toContain("not available");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test chatFormat.test.ts`
Expected: FAIL — `./chatFormat` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/chatFormat.ts
interface ExecutiveOverviewLike {
  kpis: {
    mrr: number; arr: number; revenue_growth_pct: number; customer_count: number;
    cac: number; clv: number; churn_rate_pct: number; nrr_pct: number;
  };
}

export function formatExecutiveOverview(data: ExecutiveOverviewLike): string {
  const k = data.kpis;
  return [
    `MRR: $${k.mrr.toFixed(2)}, ARR: $${k.arr.toFixed(2)}`,
    `Revenue growth: ${k.revenue_growth_pct.toFixed(1)}%`,
    `Active customers: ${k.customer_count}`,
    `CAC: $${k.cac.toFixed(2)}, CLV: $${k.clv.toFixed(2)}`,
    `Churn rate: ${k.churn_rate_pct.toFixed(1)}%, NRR: ${k.nrr_pct.toFixed(1)}%`,
  ].join("\n");
}

interface ProductOverviewLike {
  kpis: { dau: number; wau: number; mau: number; stickiness_pct: number; feature_adoption_pct: number };
  funnel: { stage: string; count: number }[];
}

export function formatProductOverview(data: ProductOverviewLike): string {
  const k = data.kpis;
  const funnelLine = data.funnel.map((f) => `${f.stage}: ${f.count}`).join(", ");
  return [
    `DAU: ${k.dau}, WAU: ${k.wau}, MAU: ${k.mau}`,
    `Stickiness: ${k.stickiness_pct.toFixed(1)}%, Feature adoption: ${k.feature_adoption_pct.toFixed(1)}%`,
    `Activation funnel: ${funnelLine}`,
  ].join("\n");
}

interface SegmentsLike {
  segments: {
    segment_label: string; company_count: number; pct_of_total: number;
    avg_usage_score: number; avg_adoption_score: number; avg_support_score: number;
    avg_revenue_score: number; avg_seat_penetration_score: number;
  }[];
}

export function formatCustomerSegments(data: SegmentsLike): string {
  return data.segments
    .map(
      (s) =>
        `${s.segment_label}: ${s.company_count} companies (${s.pct_of_total.toFixed(1)}%), ` +
        `avg scores usage=${s.avg_usage_score.toFixed(1)} adoption=${s.avg_adoption_score.toFixed(1)} ` +
        `support=${s.avg_support_score.toFixed(1)} revenue=${s.avg_revenue_score.toFixed(1)} ` +
        `seat_penetration=${s.avg_seat_penetration_score.toFixed(1)}`,
    )
    .join("\n");
}

interface ChurnRisksLike {
  companies: {
    company_name: string; churn_probability: number; risk_level: string;
    primary_risk_driver: string; secondary_risk_driver: string; recommendation: string;
  }[];
  total: number;
}

export function formatChurnRisks(data: ChurnRisksLike): string {
  if (data.companies.length === 0) return "No companies with churn predictions found.";
  const lines = data.companies.map(
    (c) =>
      `${c.company_name}: ${(c.churn_probability * 100).toFixed(0)}% churn probability (${c.risk_level} risk), ` +
      `drivers: ${c.primary_risk_driver}, ${c.secondary_risk_driver}. ${c.recommendation}`,
  );
  return `Top ${data.companies.length} highest-risk companies (of ${data.total} total):\n${lines.join("\n")}`;
}

interface CompanyProfileResultLike {
  found: boolean;
  company?: {
    name: string; industry: string; plan_tier: string;
    health: { overall_score: number; risk_level: string; recommended_action: string };
    segment_label: string | null;
    churn: {
      probability: number; risk_level: string;
      primary_risk_driver: string; secondary_risk_driver: string; recommendation: string;
    } | null;
  };
}

export function formatCompanyProfile(result: CompanyProfileResultLike): string {
  if (!result.found || !result.company) {
    return "No company found matching that name.";
  }
  const c = result.company;
  const lines = [
    `${c.name} (${c.industry}, ${c.plan_tier} plan)`,
    `Health score: ${c.health.overall_score}/100 (${c.health.risk_level} risk). ${c.health.recommended_action}`,
    `Segment: ${c.segment_label ?? "not available (company may be churned)"}`,
  ];
  if (c.churn) {
    lines.push(
      `Churn risk: ${(c.churn.probability * 100).toFixed(0)}% (${c.churn.risk_level}). ` +
        `Drivers: ${c.churn.primary_risk_driver}, ${c.churn.secondary_risk_driver}. ${c.churn.recommendation}`,
    );
  } else {
    lines.push("Churn risk: not available (company may be churned)");
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test chatFormat.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/chatFormat.ts backend/platform/chatFormat.test.ts
git commit -m "feat(backend): add chat tool-output text formatters"
```

---

### Task 5: Tool executor (`chatTools.ts`)

**Files:**
- Create: `backend/platform/chatTools.ts`
- Create: `backend/platform/chatTools.test.ts`

**Interfaces:**
- Consumes: `executiveOverview`, `productOverview`, `customerSegments`,
  `customerChurnRisk` from `./api` (all already exported, no params except
  `customerChurnRisk`'s `{page, pageSize}`); `getCompanyProfile` from
  `./companyProfile` (Task 3); `validateToolArgs` from `./toolspec` (Task 1);
  `formatExecutiveOverview`, `formatProductOverview`, `formatCustomerSegments`,
  `formatChurnRisks`, `formatCompanyProfile` from `./chatFormat` (Task 4).
- Produces: `runChatTool(name: string, args: Record<string, unknown>): Promise<string>`
  — consumed by Task 7 (`chat.ts`, and its end-to-end tests).

This is the ONLY task where all 5 tools are wired together against real data — no
Gemini involved at all, matching the design's "tool wrappers get thorough real-data
tests" principle.

**Before running this task's tests**, ml-service must be running on port 8001 (same
setup as Task 3) — `get_customer_segments`, `get_top_churn_risks`, and
`get_company_profile` all depend on it.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/chatTools.test.ts
import { describe, it, expect } from "vitest";
import { runChatTool } from "./chatTools";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("runChatTool", () => {
  it("returns a formatted executive overview", async () => {
    await ensureSeeded();
    const result = await runChatTool("get_executive_overview", {});
    expect(result).toContain("MRR:");
    expect(result).toContain("Churn rate:");
  });

  it("returns a formatted product overview", async () => {
    const result = await runChatTool("get_product_overview", {});
    expect(result).toContain("DAU:");
    expect(result).toContain("Activation funnel:");
  });

  it("returns a formatted customer segments summary", async () => {
    const result = await runChatTool("get_customer_segments", {});
    expect(result).toContain("Power Users");
    expect(result).toContain("At Risk");
  });

  it("returns a formatted top-N churn risk list respecting the limit argument", async () => {
    const result = await runChatTool("get_top_churn_risks", { limit: 3 });
    expect(result).toContain("Top 3 highest-risk companies");
  });

  it("returns a formatted company profile for a real company", async () => {
    const row = await db.queryRow<{ name: string }>`SELECT name FROM companies ORDER BY id LIMIT 1`;
    const result = await runChatTool("get_company_profile", { company_name: row!.name });
    expect(result).toContain(row!.name);
  });

  it("returns a validation error for get_company_profile with a missing company_name", async () => {
    const result = await runChatTool("get_company_profile", {});
    expect(result).toContain("Error:");
  });

  it("returns an error string for an unknown tool rather than throwing", async () => {
    const result = await runChatTool("delete_everything", {});
    expect(result).toContain("Error:");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test chatTools.test.ts`
Expected: FAIL — `./chatTools` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/chatTools.ts
import { executiveOverview, productOverview, customerSegments, customerChurnRisk } from "./api";
import { getCompanyProfile } from "./companyProfile";
import { validateToolArgs } from "./toolspec";
import {
  formatExecutiveOverview, formatProductOverview, formatCustomerSegments,
  formatChurnRisks, formatCompanyProfile,
} from "./chatFormat";

export async function runChatTool(name: string, args: Record<string, unknown>): Promise<string> {
  const v = validateToolArgs(name, args);
  if (!v.ok) return `Error: ${v.error}`;

  switch (name) {
    case "get_executive_overview": {
      const data = await executiveOverview();
      return formatExecutiveOverview(data);
    }
    case "get_product_overview": {
      const data = await productOverview();
      return formatProductOverview(data);
    }
    case "get_customer_segments": {
      const data = await customerSegments();
      return formatCustomerSegments(data);
    }
    case "get_top_churn_risks": {
      const limitArg = typeof args.limit === "number" ? args.limit : 10;
      const limit = Math.max(1, Math.min(limitArg, 50));
      const data = await customerChurnRisk({ page: 1, pageSize: limit });
      return formatChurnRisks(data);
    }
    case "get_company_profile": {
      const result = await getCompanyProfile(args.company_name as string);
      return formatCompanyProfile(result);
    }
    default:
      return `Error: unknown tool ${name}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test chatTools.test.ts`
Expected: PASS, all 7 tests. (Requires ml-service on port 8001 and Docker/Postgres both running.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/chatTools.ts backend/platform/chatTools.test.ts
git commit -m "feat(backend): add chat tool executor wiring all 5 tools"
```

---

### Task 6: Gemini model adapter (`gemini.ts`)

**Files:**
- Modify: `backend/package.json`
- Create: `backend/platform/gemini.ts`

**Interfaces:**
- Consumes: `ModelClient`, `GenContent`, `RoundChunk` types from `./agent` (Task 2);
  `toolDeclarations` from `./toolspec` (Task 1).
- Produces: `geminiModelClient(): ModelClient`, `SYSTEM_PROMPT` — consumed by Task 7.

This file has no dedicated automated test of its own — calling the real Gemini API is
expensive and rate-limited, so its correctness is proven by Task 7's 2 explicitly-gated
end-to-end tests instead. This is a deliberate scope decision, not an oversight.

- [ ] **Step 1: Add the dependency**

Add `"@google/genai": "^2.11.0"` to the `dependencies` section of `backend/package.json`
(alongside the existing `"encore.dev"` entry).

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npm install`
Expected: installs `@google/genai` without error.

- [ ] **Step 2: Implement**

```typescript
// backend/platform/gemini.ts
import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse } from "@google/genai";
import { secret } from "encore.dev/config";
import type { GenContent, ModelClient, RoundChunk } from "./agent";
import { toolDeclarations } from "./toolspec";

const geminiKey = secret("GeminiApiKey");

// Tried in order: free-tier quota bursts (429) and outages (503) on the
// primary fall back to the next model rather than erroring the chat.
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

export const SYSTEM_PROMPT = `You are SaaSPulse AI's analyst copilot for a B2B SaaS product analytics platform.
You answer using ONLY what your tools return: real executive metrics, product usage,
customer segments, and churn risk predictions. Ground every statement in tool results.

Rules:
- Use tools rather than guessing. Never invent numbers.
- If a company can't be found by get_company_profile, say so plainly rather than
  fabricating a profile.
- Be concise and precise, in plain language a business stakeholder can act on.
- This is a portfolio demo project with synthetic data.`;

function client(): GoogleGenAI {
  const key = geminiKey();
  if (!key) {
    throw new Error("GeminiApiKey secret is not set. Set it with `encore secret set`.");
  }
  return new GoogleGenAI({ apiKey: key });
}

// Adapts one Gemini streaming call to the agent loop's ModelClient interface.
export function geminiModelClient(): ModelClient {
  const ai = client();
  return {
    async *streamRound(contents: GenContent[]): AsyncGenerator<RoundChunk> {
      let stream: AsyncGenerator<GenerateContentResponse> | undefined;
      let lastErr: unknown;
      for (const model of MODELS) {
        try {
          stream = await ai.models.generateContentStream({
            model,
            contents: contents as Content[],
            config: {
              systemInstruction: SYSTEM_PROMPT,
              maxOutputTokens: 2048,
              // 2.0-era models reject thinkingConfig; 2.5 needs thinking off so
              // short answers aren't starved by the output-token budget.
              ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              tools: [{ functionDeclarations: toolDeclarations as unknown as FunctionDeclaration[] }],
            },
          });
          break;
        } catch (err) {
          lastErr = err;
          console.error(`model ${model} unavailable, trying next:`, err);
        }
      }
      if (!stream) throw lastErr;
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield { text };
        const calls = chunk.functionCalls;
        if (calls?.length) {
          yield {
            functionCalls: calls.map((c) => ({
              name: c.name ?? "",
              args: (c.args ?? {}) as Record<string, unknown>,
            })),
          };
        }
      }
    },
  };
}
```

- [ ] **Step 3: Verify with the type checker**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/package.json backend/package-lock.json backend/platform/gemini.ts
git commit -m "feat(backend): add Gemini model client adapter"
```

---

### Task 7: `POST /chat` SSE endpoint (`chat.ts`)

**Files:**
- Create: `backend/platform/chat.ts`
- Create: `backend/platform/chat.test.ts`

**Interfaces:**
- Consumes: `chatStream`, `ChatMessage` from `./agent` (Task 2); `geminiModelClient`
  from `./gemini` (Task 6); `runChatTool` from `./chatTools` (Task 5).
- Produces: `chat` exported Encore raw API handler at `POST /chat`;
  `parseMessages(body: unknown): ChatMessage[] | null` (exported for direct,
  Gemini-free unit testing) — consumed by Task 8 (the frontend page's request shape).

**Before running this task's tests**, ml-service must be running on port 8001, and
Docker/Postgres must be running. **The 2 end-to-end tests in this file additionally
require a real `GeminiApiKey` secret configured** (`encore secret set --type dev
GeminiApiKey`) and are gated behind `RUN_GEMINI_TESTS=1` — they do NOT run under a
plain `encore test`.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/chat.test.ts
import { describe, it, expect } from "vitest";
import { parseMessages, chat } from "./chat";
import { chatStream, type ChatMessage } from "./agent";
import { geminiModelClient } from "./gemini";
import { runChatTool } from "./chatTools";
import { ensureSeeded } from "./seed";

describe("parseMessages", () => {
  it("accepts a valid message list ending in a user message", () => {
    expect(parseMessages({ messages: [{ role: "user", text: "hi" }] })).toEqual([{ role: "user", text: "hi" }]);
  });

  it("rejects a missing messages array", () => {
    expect(parseMessages({})).toBeNull();
  });

  it("rejects an empty messages array", () => {
    expect(parseMessages({ messages: [] })).toBeNull();
  });

  it("rejects a message list ending in a model message", () => {
    const result = parseMessages({ messages: [{ role: "user", text: "hi" }, { role: "model", text: "hello" }] });
    expect(result).toBeNull();
  });

  it("rejects a message with an empty text field", () => {
    expect(parseMessages({ messages: [{ role: "user", text: "   " }] })).toBeNull();
  });
});

// Gated: only runs with RUN_GEMINI_TESTS=1, since these hit the real Gemini API
// and Gemini's free tier is rate-limited (~20 requests/day/model).
describe.skipIf(!process.env.RUN_GEMINI_TESTS)("chat end-to-end (real Gemini)", () => {
  it("answers a single-tool-call question with real data, grounded in a tool result", async () => {
    await ensureSeeded();
    const history: ChatMessage[] = [{ role: "user", text: "What is our current MRR?" }];
    const events = [];
    for await (const e of chatStream(history, geminiModelClient(), runChatTool)) events.push(e);

    const steps = events.filter((e) => e.type === "step");
    const textEvents = events.filter((e) => e.type === "text");
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    const fullAnswer = textEvents.map((e) => (e as { text: string }).text).join("");
    expect(fullAnswer.length).toBeGreaterThan(0);
  }, 30000);

  it("answers a question plausibly requiring multiple different tool calls", async () => {
    await ensureSeeded();
    const history: ChatMessage[] = [
      { role: "user", text: "Give me our top 3 churn risks and our customer segment breakdown." },
    ];
    const events = [];
    for await (const e of chatStream(history, geminiModelClient(), runChatTool)) events.push(e);

    const steps = events.filter((e) => e.type === "step");
    const textEvents = events.filter((e) => e.type === "text");
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    const fullAnswer = textEvents.map((e) => (e as { text: string }).text).join("");
    expect(fullAnswer.length).toBeGreaterThan(0);
  }, 30000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test chat.test.ts`
Expected: FAIL — `./chat` module not found. (The gated `describe` block is skipped
either way since `RUN_GEMINI_TESTS` is unset, so only the 5 `parseMessages` tests
attempt to run and fail on the missing import.)

- [ ] **Step 3: Implement**

```typescript
// backend/platform/chat.ts
import { api } from "encore.dev/api";
import { chatStream, type ChatMessage } from "./agent";
import { geminiModelClient } from "./gemini";
import { runChatTool } from "./chatTools";

const MAX_BODY_BYTES = 64 * 1024;

async function readJsonBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += (c as Buffer).length;
    if (total > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function sseInit(resp: any): void {
  resp.setHeader("Content-Type", "text/event-stream");
  resp.setHeader("Cache-Control", "no-cache");
}

function sseSend(resp: any, event: Record<string, unknown>): void {
  resp.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function parseMessages(body: any): ChatMessage[] | null {
  if (!Array.isArray(body?.messages) || body.messages.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const m of body.messages) {
    if ((m?.role !== "user" && m?.role !== "model") || typeof m?.text !== "string" || m.text.trim() === "") {
      return null;
    }
    messages.push({ role: m.role, text: m.text });
  }
  return messages.at(-1)?.role === "user" ? messages : null;
}

// Chat over SSE via api.raw (no generated client needed). The client POSTs
// {messages:[{role,text}...]} and receives typed events, one JSON object per
// `data:` line: step | text | error | done.
export const chat = api.raw(
  { expose: true, method: "POST", path: "/chat" },
  async (req, resp) => {
    sseInit(resp);
    try {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch {
        sseSend(resp, { type: "error", message: "Invalid request body." });
        return;
      }
      const messages = parseMessages(body);
      if (!messages) {
        sseSend(resp, { type: "error", message: "Body must be {messages:[{role,text}...]} ending with a user message." });
        return;
      }
      for await (const event of chatStream(messages, geminiModelClient(), runChatTool)) {
        sseSend(resp, event);
      }
    } catch (err) {
      console.error("chat stream failed:", err);
      sseSend(resp, { type: "error", message: "Sorry, an error occurred while generating the answer." });
    } finally {
      sseSend(resp, { type: "done" });
      resp.end();
    }
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test chat.test.ts`
Expected: PASS, 5 tests (the gated block still skipped — this is correct, not a failure).

Then, separately and deliberately (this call WILL use real Gemini quota):
Run: `cd backend && RUN_GEMINI_TESTS=1 encore test chat.test.ts`
Expected: PASS, all 7 tests (5 `parseMessages` + 2 real end-to-end).

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/chat.ts backend/platform/chat.test.ts
git commit -m "feat(backend): add POST /chat SSE endpoint"
```

---

### Task 8: `/copilot` frontend page, final verification

**Files:**
- Create: `frontend/app/copilot/page.tsx`

**Interfaces:**
- Consumes: `POST /chat` (Task 7) directly via `fetch` + `ReadableStream` — no
  `lib/api.ts` helper, since SSE streaming doesn't fit this project's existing
  `await fetch().json()` pattern used by every other page.

This is the first Client Component (`"use client"`) in this project — every page
built in Phases 2-6 is a Server Component, but SSE requires client-side `fetch` +
`ReadableStream` reading, which Server Components cannot do. This is a deliberate,
necessary exception.

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/copilot/page.tsx
"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

type ChatEvent =
  | { type: "step"; tool: string; label: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export default function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setStatus(null);

    const history = [...messagesRef.current, { role: "user" as const, text: question }];
    setMessages(history);

    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-20) }),
    });

    if (!res.body) {
      setMessages([...history, { role: "model", text: "Sorry, no response received." }]);
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let hasAnswer = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event: ChatEvent = JSON.parse(chunk.slice(6));

        if (event.type === "step") {
          setStatus(event.label);
        } else if (event.type === "text") {
          answer += event.text;
          hasAnswer = true;
          setStatus(null);
          setMessages([...history, { role: "model", text: answer }]);
        } else if (event.type === "error") {
          answer = event.message;
          hasAnswer = true;
          setMessages([...history, { role: "model", text: answer }]);
        }
      }
    }

    if (!hasAnswer) {
      setMessages([...history, { role: "model", text: "No answer was returned." }]);
    }
    setStatus(null);
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Analyst Copilot</h1>

      <div className="space-y-3">
        {messages.map((m, i) => (
          <Card key={i} className={m.role === "user" ? "ml-auto max-w-[80%] bg-primary/5" : "mr-auto max-w-[80%]"}>
            <CardContent className="whitespace-pre-wrap p-3 text-sm">{m.text}</CardContent>
          </Card>
        ))}
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your business..."
          disabled={busy}
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy || !input.trim()}
        >
          Send
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification against the real backend, ml-service, and Gemini**

With Docker/Postgres running, `ml-service` running (`cd ml-service && .venv/bin/uvicorn
main:app --port 8001`), the Encore backend running (`cd backend && encore run`), and a
real `GeminiApiKey` secret configured, briefly start the frontend (this project's
established convention — never a long-running `next dev` session) and confirm, using a
real browser (Playwright-driven Chromium, already available in this project's
scratchpad):

- Typing a question like "What is our MRR?" and submitting shows a transient status
  line (e.g. "Checking executive overview...") followed by a real, non-empty answer
  referencing real numbers (cross-check against `curl .../metrics/executive-overview`)
- Asking about a real company by name (fetch one via
  `curl .../companies?pageSize=1` first) returns a grounded profile mentioning that
  company's actual health/segment/churn data
- Asking about a company that doesn't exist gets a "not found" style answer, not a
  fabricated profile
- The user-message bubble and the assistant-message bubble are visually distinguished
  (right vs. left alignment / background)
- Take a full-page screenshot and visually inspect for layout issues

- [ ] **Step 4: Run the full test suites**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: all tests pass (unaffected by this phase — no ml-service changes).

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions (the 2 gated Gemini tests are skipped by
default, as intended — this is correct behavior, not a gap in coverage, since they
were already run explicitly in Task 7).

- [ ] **Step 5: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/copilot/page.tsx
git commit -m "feat(frontend): add /copilot chat page"
git push origin main
```
