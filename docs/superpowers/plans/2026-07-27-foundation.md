# SaaSPulse AI — Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SaaSPulse AI monorepo — Encore.ts backend with an 8-table schema, a leakage-safe synthetic data generator (1000 companies / 5000 users / 100,000 events), four API endpoints, and a Next.js `/dashboard` page rendering live data — so every later module phase has real data and a working chain to build on.

**Architecture:** Monorepo with `backend/platform` (Encore.ts, owns Postgres via native SQL DB + migrations), `frontend` (Next.js 15 App Router + Tailwind + shadcn/ui, server-component data fetching), `ml-service` (Python/FastAPI stub only in this phase). Full rationale in `docs/superpowers/specs/2026-07-27-foundation-design.md`.

**Tech Stack:** Encore.ts (`encore.dev` SDK, tagged-template + raw SQL queries, vitest), Next.js 15 + TypeScript + Tailwind + shadcn/ui, Python 3 + FastAPI (stub only).

## Global Constraints

- Currency is GBP (£) everywhere it's displayed or computed.
- No mocked frontend data — every page fetches live from the Encore API.
- Synthetic volumes: 1000 companies, 5000 users, 100,000 product events, 12 months of event history, spread over an 18-month signup window.
- `company_health_factor` and `true_churn_probability` are generation-only — never written to any table, never returned by any API.
- Plan tier distribution: free ~35%, starter ~35%, professional ~25%, enterprise ~5% (free+starter ≈70% combined, per spec).
- Follow the file/module conventions already established in `~/Desktop/Healthcare claims project` (colocated `.test.ts` files, `encore.service.ts` + `db.ts` per service, plain `fetch` from the frontend, no generated Encore client).
- Verify the frontend via `npx tsc --noEmit` and a deployed preview, not a long-running local `next dev`/`next build` — those have hung on this machine on other Next.js projects.

---

### Task 1: Backend scaffold + health endpoint

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.gitignore`
- Create: `backend/platform/encore.service.ts`
- Create: `backend/platform/db.ts`
- Create: `backend/platform/api.ts`
- Test: `backend/platform/api.test.ts`

**Interfaces:**
- Produces: `db` (exported `SQLDatabase` from `backend/platform/db.ts`), `health` (exported Encore API handler from `backend/platform/api.ts`, returns `Promise<{ status: string }>`).

- [ ] **Step 1: Install the Encore CLI and create the app**

```bash
curl -L https://encore.dev/install.sh | bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
mkdir -p backend
cd backend && encore app create --name saaspulse-ai-platform
```

When prompted, choose "Empty app" (TypeScript). This writes `backend/encore.app` with a real `id` — commit it once generated.

- [ ] **Step 2: Write package.json**

```json
{
  "name": "platform-backend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "encore.dev": "^1.57.8"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "~encore/*": ["./encore.gen/*"] }
  }
}
```

- [ ] **Step 4: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 5: Write .gitignore**

```
node_modules/
encore.gen/
.encore/
```

- [ ] **Step 6: Install dependencies**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npm install
```

- [ ] **Step 7: Write the platform service definition**

```ts
// backend/platform/encore.service.ts
import { Service } from "encore.dev/service";

export default new Service("platform");
```

- [ ] **Step 8: Write the database handle (no migrations yet — added in Task 2)**

```ts
// backend/platform/db.ts
import { SQLDatabase } from "encore.dev/storage/sqldb";

export const db = new SQLDatabase("platform", {
  migrations: "./migrations",
});
```

- [ ] **Step 9: Write the failing test for the health endpoint**

```ts
// backend/platform/api.test.ts
import { describe, it, expect } from "vitest";
import { health } from "./api";

describe("health", () => {
  it("returns ok", async () => {
    expect(await health()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/api.test.ts`
Expected: FAIL — `./api` has no exported member `health` (module not found or missing export).

- [ ] **Step 11: Write the health endpoint**

```ts
// backend/platform/api.ts
import { api } from "encore.dev/api";

export const health = api(
  { method: "GET", path: "/health", expose: true },
  async (): Promise<{ status: string }> => {
    return { status: "ok" };
  },
);
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/api.test.ts`
Expected: PASS

- [ ] **Step 13: Verify the app runs under Encore**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore run &` then `curl http://localhost:4000/health` — expect `{"status":"ok"}`. Stop the background process afterward (`kill %1` or `encore run` Ctrl-C if run in foreground instead).

- [ ] **Step 14: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/package.json backend/tsconfig.json backend/vitest.config.ts backend/.gitignore backend/encore.app backend/platform/encore.service.ts backend/platform/db.ts backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): scaffold Encore platform service with health endpoint"
```

---

### Task 2: Database schema migration

**Files:**
- Create: `backend/platform/migrations/1_schema.up.sql`
- Test: `backend/platform/schema.test.ts`

**Interfaces:**
- Consumes: `db` from Task 1 (`backend/platform/db.ts`).
- Produces: eight tables — `companies`, `users`, `subscriptions`, `subscription_events`, `product_events`, `support_tickets`, `customer_health_scores`, `ml_predictions` — that every later task's generators and API endpoints read/write by these exact table and column names.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/schema.test.ts
import { describe, it, expect } from "vitest";
import { db } from "./db";

describe("schema", () => {
  it("has all eight platform tables", async () => {
    const rows = db.query<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const names = new Set<string>();
    for await (const r of rows) names.add(r.table_name);

    for (const table of [
      "companies", "users", "subscriptions", "subscription_events",
      "product_events", "support_tickets", "customer_health_scores", "ml_predictions",
    ]) {
      expect(names.has(table)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/schema.test.ts`
Expected: FAIL — table names missing (empty `migrations/` directory so far).

- [ ] **Step 3: Write the migration**

```sql
-- backend/platform/migrations/1_schema.up.sql

CREATE TABLE companies (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    industry       TEXT NOT NULL,
    company_size   INTEGER NOT NULL,
    plan_tier      TEXT NOT NULL CHECK (plan_tier IN ('free','starter','professional','enterprise')),
    customer_stage TEXT NOT NULL CHECK (customer_stage IN ('trial','onboarding','active','growing','power_user','at_risk','churned')),
    signup_date    DATE NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id             TEXT PRIMARY KEY,
    company_id     TEXT NOT NULL REFERENCES companies(id),
    email          TEXT NOT NULL,
    role           TEXT NOT NULL,
    first_login_at TIMESTAMPTZ,
    last_login_at  TIMESTAMPTZ,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_company_id_idx ON users(company_id);

CREATE TABLE subscriptions (
    id            TEXT PRIMARY KEY,
    company_id    TEXT NOT NULL REFERENCES companies(id),
    plan_name     TEXT NOT NULL,
    mrr_amount    NUMERIC(10,2) NOT NULL,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
    status        TEXT NOT NULL CHECK (status IN ('active','canceled','trialing','past_due')),
    start_date    DATE NOT NULL,
    end_date      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_company_id_idx ON subscriptions(company_id);

CREATE TABLE subscription_events (
    subscription_event_id TEXT PRIMARY KEY,
    company_id            TEXT NOT NULL REFERENCES companies(id),
    event_date            DATE NOT NULL,
    event_type            TEXT NOT NULL CHECK (event_type IN ('new_subscription','upgrade','downgrade','cancellation','renewal')),
    previous_plan         TEXT,
    new_plan              TEXT,
    mrr_change            NUMERIC(10,2) NOT NULL
);
CREATE INDEX subscription_events_company_id_idx ON subscription_events(company_id);
CREATE INDEX subscription_events_event_date_idx ON subscription_events(event_date);

CREATE TABLE product_events (
    event_id         TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id),
    company_id       TEXT NOT NULL REFERENCES companies(id),
    "timestamp"      TIMESTAMPTZ NOT NULL,
    event_name       TEXT NOT NULL,
    feature_name     TEXT,
    session_duration INTEGER NOT NULL,
    device_type      TEXT NOT NULL CHECK (device_type IN ('desktop','mobile','tablet'))
);
CREATE INDEX product_events_company_id_idx ON product_events(company_id);
CREATE INDEX product_events_user_id_idx ON product_events(user_id);
CREATE INDEX product_events_timestamp_idx ON product_events("timestamp");

CREATE TABLE support_tickets (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies(id),
    user_id     TEXT REFERENCES users(id),
    subject     TEXT NOT NULL,
    priority    TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
    status      TEXT NOT NULL CHECK (status IN ('open','closed','pending')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX support_tickets_company_id_idx ON support_tickets(company_id);

CREATE TABLE customer_health_scores (
    id                  TEXT PRIMARY KEY,
    company_id          TEXT NOT NULL REFERENCES companies(id),
    score_date          DATE NOT NULL,
    usage_score         NUMERIC(5,2) NOT NULL,
    adoption_score      NUMERIC(5,2) NOT NULL,
    support_score       NUMERIC(5,2) NOT NULL,
    revenue_score       NUMERIC(5,2) NOT NULL,
    overall_score       NUMERIC(5,2) NOT NULL,
    risk_level          TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
    recommended_action  TEXT NOT NULL
);
CREATE INDEX customer_health_scores_company_id_idx ON customer_health_scores(company_id);

CREATE TABLE ml_predictions (
    id                TEXT PRIMARY KEY,
    company_id        TEXT NOT NULL REFERENCES companies(id),
    prediction_type   TEXT NOT NULL CHECK (prediction_type IN ('churn_probability','segment')),
    prediction_date   DATE NOT NULL,
    churn_probability NUMERIC(5,4),
    segment_label     TEXT,
    main_drivers      JSONB,
    recommendation    TEXT,
    model_version     TEXT NOT NULL
);
CREATE INDEX ml_predictions_company_id_idx ON ml_predictions(company_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/migrations/1_schema.up.sql backend/platform/schema.test.ts
git commit -m "feat(backend): add 8-table platform schema migration"
```

---

### Task 3: Shared generator types + seeded RNG utilities

**Files:**
- Create: `backend/platform/generate/types.ts`
- Create: `backend/platform/generate/rng.ts`
- Test: `backend/platform/generate/rng.test.ts`

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number`, `pickWeighted<T>(rng, items: {value: T; weight: number}[]): T`, `randomInt(rng, min, max): number`, `randomDateBetween(rng, start: Date, end: Date): Date` — used by every generator task (4–7). Also produces the shared row types (`PlanTier`, `CustomerStage`, `SubscriptionStatus`, `BillingCycle`, `SubscriptionEventType`, `DeviceType`, `HealthProfile`, `CompanyRow`, `UserRow`, `SubscriptionRow`, `SubscriptionEventRow`, `ProductEventRow`, `SupportTicketRow`) that every later task imports rather than redefining.

- [ ] **Step 1: Write the shared types**

```ts
// backend/platform/generate/types.ts
export type PlanTier = "free" | "starter" | "professional" | "enterprise";
export type CustomerStage =
  | "trial" | "onboarding" | "active" | "growing" | "power_user" | "at_risk" | "churned";
export type SubscriptionStatus = "active" | "canceled" | "trialing" | "past_due";
export type BillingCycle = "monthly" | "annual";
export type SubscriptionEventType =
  | "new_subscription" | "upgrade" | "downgrade" | "cancellation" | "renewal";
export type DeviceType = "desktop" | "mobile" | "tablet";

export interface HealthProfile {
  companyId: string;
  healthFactor: number;
  churnProbability: number;
}

export interface CompanyRow {
  id: string;
  name: string;
  industry: string;
  companySize: number;
  planTier: PlanTier;
  customerStage: CustomerStage;
  signupDate: string;
}

export interface UserRow {
  id: string;
  companyId: string;
  email: string;
  role: string;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SubscriptionRow {
  id: string;
  companyId: string;
  planName: PlanTier;
  mrrAmount: number;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
}

export interface SubscriptionEventRow {
  id: string;
  companyId: string;
  eventDate: string;
  eventType: SubscriptionEventType;
  previousPlan: PlanTier | null;
  newPlan: PlanTier | null;
  mrrChange: number;
}

export interface ProductEventRow {
  id: string;
  userId: string;
  companyId: string;
  timestamp: string;
  eventName: string;
  featureName: string | null;
  sessionDuration: number;
  deviceType: DeviceType;
}

export interface SupportTicketRow {
  id: string;
  companyId: string;
  userId: string | null;
  subject: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "closed" | "pending";
  createdAt: string;
  resolvedAt: string | null;
}
```

- [ ] **Step 2: Write the failing test for the RNG utilities**

```ts
// backend/platform/generate/rng.test.ts
import { describe, it, expect } from "vitest";
import { mulberry32, pickWeighted, randomInt, randomDateBetween } from "./rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pickWeighted", () => {
  it("only ever returns items with weight > 0 when others are 0", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      const v = pickWeighted(rng, [{ value: "a", weight: 0 }, { value: "b", weight: 1 }]);
      expect(v).toBe("b");
    }
  });
});

describe("randomInt", () => {
  it("stays within [min, max] inclusive", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const v = randomInt(rng, 5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
    }
  });
});

describe("randomDateBetween", () => {
  it("stays within the given range", () => {
    const rng = mulberry32(9);
    const start = new Date("2025-01-01");
    const end = new Date("2025-02-01");
    for (let i = 0; i < 50; i++) {
      const d = randomDateBetween(rng, start, end);
      expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/rng.test.ts`
Expected: FAIL — `./rng` module not found.

- [ ] **Step 4: Write the RNG utilities**

```ts
// backend/platform/generate/rng.ts
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(
  rng: () => number,
  items: { value: T; weight: number }[],
): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomDateBetween(rng: () => number, start: Date, end: Date): Date {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(t);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/rng.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/generate/types.ts backend/platform/generate/rng.ts backend/platform/generate/rng.test.ts
git commit -m "feat(backend): add shared generator types and seeded RNG utilities"
```

---

### Task 4: Company generator with hidden health/churn profile

**Files:**
- Create: `backend/platform/generate/companies.ts`
- Test: `backend/platform/generate/companies.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `pickWeighted`, `randomInt`, `randomDateBetween` from Task 3's `rng.ts`; `CompanyRow`, `HealthProfile`, `PlanTier` from Task 3's `types.ts`.
- Produces: `generateCompanies(count: number, seed: number, now: Date): { companies: CompanyRow[]; healthProfiles: HealthProfile[] }` — consumed by Tasks 5, 6, 7, and 8. `healthProfiles` is never passed to any DB-insert function.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/generate/companies.test.ts
import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";

describe("generateCompanies", () => {
  const now = new Date("2026-07-27");

  it("generates the requested count with unique ids", () => {
    const { companies } = generateCompanies(200, 1, now);
    expect(companies).toHaveLength(200);
    expect(new Set(companies.map((c) => c.id)).size).toBe(200);
  });

  it("produces one health profile per company, never exposed on the row", () => {
    const { companies, healthProfiles } = generateCompanies(200, 1, now);
    expect(healthProfiles).toHaveLength(200);
    const company = companies[0] as unknown as Record<string, unknown>;
    expect(company.healthFactor).toBeUndefined();
    expect(company.churnProbability).toBeUndefined();
  });

  it("skews plan tier toward free/starter", () => {
    const { companies } = generateCompanies(1000, 5, now);
    const freeOrStarter = companies.filter((c) => c.planTier === "free" || c.planTier === "starter").length;
    expect(freeOrStarter / companies.length).toBeGreaterThan(0.5);
  });

  it("keeps signup dates within the trailing 18 months", () => {
    const { companies } = generateCompanies(200, 2, now);
    const windowStart = new Date(now);
    windowStart.setMonth(windowStart.getMonth() - 18);
    for (const c of companies) {
      const signup = new Date(c.signupDate);
      expect(signup.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
      expect(signup.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/companies.test.ts`
Expected: FAIL — `./companies` module not found.

- [ ] **Step 3: Write the generator**

```ts
// backend/platform/generate/companies.ts
import { mulberry32, pickWeighted, randomInt, randomDateBetween } from "./rng";
import type { CompanyRow, HealthProfile, PlanTier } from "./types";

const INDUSTRIES = [
  "Software", "Financial Services", "Healthcare", "Retail", "Manufacturing",
  "Education", "Media", "Logistics", "Real Estate", "Professional Services",
];

const PLAN_TIERS: { value: PlanTier; weight: number }[] = [
  { value: "free", weight: 35 },
  { value: "starter", weight: 35 },
  { value: "professional", weight: 25 },
  { value: "enterprise", weight: 5 },
];

const COMPANY_SIZE_RANGE: Record<PlanTier, [number, number]> = {
  free: [5, 50],
  starter: [5, 50],
  professional: [50, 500],
  enterprise: [500, 5000],
};

export interface CompanyGenerationResult {
  companies: CompanyRow[];
  healthProfiles: HealthProfile[];
}

export function generateCompanies(count: number, seed: number, now: Date): CompanyGenerationResult {
  const rng = mulberry32(seed);
  const companies: CompanyRow[] = [];
  const healthProfiles: HealthProfile[] = [];

  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 18);

  for (let i = 1; i <= count; i++) {
    const id = `CMP-${String(i).padStart(4, "0")}`;
    const planTier = pickWeighted(rng, PLAN_TIERS);
    const [minSize, maxSize] = COMPANY_SIZE_RANGE[planTier];
    const signupDate = randomDateBetween(rng, windowStart, now);
    const industry = INDUSTRIES[randomInt(rng, 0, INDUSTRIES.length - 1)];
    const healthFactor = rng() * 100;
    const churnProbability = Math.min(0.7, Math.max(0.02, 0.02 + ((100 - healthFactor) / 100) * 0.6));

    companies.push({
      id,
      name: `${industry} Co ${i}`,
      industry,
      companySize: randomInt(rng, minSize, maxSize),
      planTier,
      // Finalized by generateSubscriptionsAndEvents (Task 5) once churn outcome is known.
      customerStage: "trial",
      signupDate: signupDate.toISOString().slice(0, 10),
    });

    healthProfiles.push({ companyId: id, healthFactor, churnProbability });
  }

  return { companies, healthProfiles };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/companies.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/generate/companies.ts backend/platform/generate/companies.test.ts
git commit -m "feat(backend): add company generator with hidden health/churn profile"
```

---

### Task 5: User generator

**Files:**
- Create: `backend/platform/generate/users.ts`
- Test: `backend/platform/generate/users.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `randomInt`, `randomDateBetween` from Task 3; `CompanyRow`, `UserRow`, `PlanTier` from Task 3; `CompanyRow[]` from Task 4's `generateCompanies`.
- Produces: `generateUsers(companies: CompanyRow[], seed: number, now: Date): UserRow[]` — consumed by Tasks 6, 7, 8.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/generate/users.test.ts
import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateUsers } from "./users";

describe("generateUsers", () => {
  const now = new Date("2026-07-27");

  it("generates at least one user per company, all with unique ids", () => {
    const { companies } = generateCompanies(100, 11, now);
    const users = generateUsers(companies, 12, now);
    expect(new Set(users.map((u) => u.id)).size).toBe(users.length);

    const byCompany = new Map<string, number>();
    for (const u of users) byCompany.set(u.companyId, (byCompany.get(u.companyId) ?? 0) + 1);
    for (const c of companies) expect(byCompany.get(c.id) ?? 0).toBeGreaterThan(0);
  });

  it("gives enterprise companies more seats on average than free companies", () => {
    const { companies } = generateCompanies(500, 13, now);
    const users = generateUsers(companies, 14, now);
    const byCompany = new Map<string, number>();
    for (const u of users) byCompany.set(u.companyId, (byCompany.get(u.companyId) ?? 0) + 1);

    const avg = (tier: string) => {
      const ids = companies.filter((c) => c.planTier === tier).map((c) => c.id);
      const counts = ids.map((id) => byCompany.get(id) ?? 0);
      return counts.reduce((s, n) => s + n, 0) / counts.length;
    };

    expect(avg("enterprise")).toBeGreaterThan(avg("free"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/users.test.ts`
Expected: FAIL — `./users` module not found.

- [ ] **Step 3: Write the generator**

```ts
// backend/platform/generate/users.ts
import { mulberry32, randomInt, randomDateBetween } from "./rng";
import type { CompanyRow, UserRow, PlanTier } from "./types";

// Scaled down from the plan table's literal seat ranges (free 1-3 ... enterprise 50-500)
// so the total across 1000 companies lands near the spec's target of 5000 users,
// while keeping the same relative skew across tiers.
const SEAT_RANGE: Record<PlanTier, [number, number]> = {
  free: [1, 3],
  starter: [2, 6],
  professional: [4, 12],
  enterprise: [8, 30],
};

const ROLES = ["Admin", "Analyst", "Manager", "Viewer"];

export function generateUsers(companies: CompanyRow[], seed: number, now: Date): UserRow[] {
  const rng = mulberry32(seed);
  const users: UserRow[] = [];
  let counter = 1;

  for (const company of companies) {
    const [minSeats, maxSeats] = SEAT_RANGE[company.planTier];
    const seatCount = randomInt(rng, minSeats, maxSeats);
    const signupDate = new Date(company.signupDate);

    for (let s = 0; s < seatCount; s++) {
      const id = `USR-${String(counter).padStart(5, "0")}`;
      const createdAt = randomDateBetween(rng, signupDate, now);
      const hasLoggedIn = rng() < 0.9;
      const firstLoginAt = hasLoggedIn ? randomDateBetween(rng, createdAt, now).toISOString() : null;
      const lastLoginAt =
        hasLoggedIn && firstLoginAt ? randomDateBetween(rng, new Date(firstLoginAt), now).toISOString() : null;
      const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, "");

      users.push({
        id,
        companyId: company.id,
        email: `user${counter}@${slug}.example`,
        role: ROLES[randomInt(rng, 0, ROLES.length - 1)],
        firstLoginAt,
        lastLoginAt,
        isActive: rng() < 0.85,
        createdAt: createdAt.toISOString(),
      });

      counter++;
    }
  }

  return users;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/generate/users.ts backend/platform/generate/users.test.ts
git commit -m "feat(backend): add user generator with plan-tier-correlated seat counts"
```

---

### Task 6: Subscription + subscription_event generator (finalizes customer_stage)

**Files:**
- Create: `backend/platform/generate/subscriptions.ts`
- Test: `backend/platform/generate/subscriptions.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `randomDateBetween` from Task 3; `CompanyRow`, `HealthProfile`, `SubscriptionRow`, `SubscriptionEventRow`, `PlanTier`, `CustomerStage` from Task 3; `CompanyRow[]`/`HealthProfile[]` from Task 4's `generateCompanies`.
- Produces: `generateSubscriptionsAndEvents(companies, healthProfiles, seed, now): { companies: CompanyRow[]; subscriptions: SubscriptionRow[]; events: SubscriptionEventRow[] }`. The returned `companies` array has `customerStage` finalized (no longer the `"trial"` default from Task 4) — Tasks 7, 8, 9 must use **this** returned array, not the one from `generateCompanies` directly.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/generate/subscriptions.test.ts
import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateSubscriptionsAndEvents } from "./subscriptions";

describe("generateSubscriptionsAndEvents", () => {
  const now = new Date("2026-07-27");

  it("creates exactly one subscription and a new_subscription event per company", () => {
    const { companies, healthProfiles } = generateCompanies(500, 21, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 22, now);
    expect(result.subscriptions).toHaveLength(500);
    const newSubEvents = result.events.filter((e) => e.eventType === "new_subscription");
    expect(newSubEvents).toHaveLength(500);
  });

  it("marks canceled subscriptions as churned with a matching cancellation event", () => {
    const { companies, healthProfiles } = generateCompanies(500, 23, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 24, now);
    const canceled = result.subscriptions.filter((s) => s.status === "canceled");
    expect(canceled.length).toBeGreaterThan(0);
    for (const sub of canceled) {
      expect(sub.endDate).not.toBeNull();
      const cancelEvent = result.events.find(
        (e) => e.companyId === sub.companyId && e.eventType === "cancellation",
      );
      expect(cancelEvent).toBeDefined();
    }
  });

  it("finalizes customer_stage to 'churned' exactly for canceled companies", () => {
    const { companies, healthProfiles } = generateCompanies(500, 25, now);
    const result = generateSubscriptionsAndEvents(companies, healthProfiles, 26, now);
    const churnedCompanyIds = new Set(
      result.subscriptions.filter((s) => s.status === "canceled").map((s) => s.companyId),
    );
    for (const c of result.companies) {
      expect(c.customerStage === "churned").toBe(churnedCompanyIds.has(c.id));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/subscriptions.test.ts`
Expected: FAIL — `./subscriptions` module not found.

- [ ] **Step 3: Write the generator**

```ts
// backend/platform/generate/subscriptions.ts
import { mulberry32, randomDateBetween } from "./rng";
import type {
  CompanyRow, HealthProfile, SubscriptionRow, SubscriptionEventRow, PlanTier, CustomerStage,
} from "./types";

const MRR_BY_PLAN: Record<PlanTier, number> = {
  free: 0,
  starter: 99,
  professional: 499,
  enterprise: 5000,
};

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function assignCustomerStage(
  healthFactor: number,
  monthsSinceSignup: number,
  isChurned: boolean,
): CustomerStage {
  if (isChurned) return "churned";
  if (monthsSinceSignup < 1) return "trial";
  if (monthsSinceSignup < 3) return "onboarding";
  if (healthFactor >= 80) return monthsSinceSignup >= 6 ? "power_user" : "growing";
  if (healthFactor < 40) return "at_risk";
  return "active";
}

export interface SubscriptionGenerationResult {
  companies: CompanyRow[];
  subscriptions: SubscriptionRow[];
  events: SubscriptionEventRow[];
}

export function generateSubscriptionsAndEvents(
  companies: CompanyRow[],
  healthProfiles: HealthProfile[],
  seed: number,
  now: Date,
): SubscriptionGenerationResult {
  const rng = mulberry32(seed);
  const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h]));
  const subscriptions: SubscriptionRow[] = [];
  const events: SubscriptionEventRow[] = [];
  const finalizedCompanies: CompanyRow[] = [];
  let subCounter = 1;
  let eventCounter = 1;
  const nextEventId = () => `SEV-${String(eventCounter++).padStart(6, "0")}`;

  for (const company of companies) {
    const health = healthByCompany.get(company.id)!;
    const signupDate = new Date(company.signupDate);
    const monthsSinceSignup = monthsBetween(signupDate, now);
    const baseMrr = MRR_BY_PLAN[company.planTier];

    events.push({
      id: nextEventId(),
      companyId: company.id,
      eventDate: company.signupDate,
      eventType: "new_subscription",
      previousPlan: null,
      newPlan: company.planTier,
      mrrChange: baseMrr,
    });

    const exposure = Math.min(1, monthsSinceSignup / 12);
    const isChurned = monthsSinceSignup >= 1 && rng() < health.churnProbability * exposure;

    let currentMrr = baseMrr;
    const currentPlan = company.planTier;
    let status: SubscriptionRow["status"] = monthsSinceSignup < 1 ? "trialing" : "active";
    let endDate: string | null = null;

    const midTenureFloor = new Date(signupDate);
    midTenureFloor.setDate(midTenureFloor.getDate() + 30);

    const canExpand =
      !isChurned && health.healthFactor >= 70 && monthsSinceSignup >= 3 && currentPlan !== "enterprise";
    const canContract = !isChurned && health.healthFactor < 40 && monthsSinceSignup >= 3;

    if (canExpand && rng() < 0.2) {
      const upgradeDate = randomDateBetween(rng, midTenureFloor, now);
      const newMrr = currentMrr * 1.5;
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: upgradeDate.toISOString().slice(0, 10),
        eventType: "upgrade",
        previousPlan: currentPlan,
        newPlan: currentPlan,
        mrrChange: newMrr - currentMrr,
      });
      currentMrr = newMrr;
    } else if (canContract && rng() < 0.2) {
      const downgradeDate = randomDateBetween(rng, midTenureFloor, now);
      const newMrr = currentMrr * 0.6;
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: downgradeDate.toISOString().slice(0, 10),
        eventType: "downgrade",
        previousPlan: currentPlan,
        newPlan: currentPlan,
        mrrChange: newMrr - currentMrr,
      });
      currentMrr = newMrr;
    }

    if (isChurned) {
      const cancelDate = randomDateBetween(rng, signupDate, now);
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: cancelDate.toISOString().slice(0, 10),
        eventType: "cancellation",
        previousPlan: currentPlan,
        newPlan: null,
        mrrChange: -currentMrr,
      });
      status = "canceled";
      endDate = cancelDate.toISOString().slice(0, 10);
    } else if (monthsSinceSignup >= 12) {
      const renewalDate = new Date(signupDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: renewalDate.toISOString().slice(0, 10),
        eventType: "renewal",
        previousPlan: currentPlan,
        newPlan: currentPlan,
        mrrChange: 0,
      });
      if (health.healthFactor < 30 && rng() < 0.1) status = "past_due";
    }

    subscriptions.push({
      id: `SUB-${String(subCounter++).padStart(4, "0")}`,
      companyId: company.id,
      planName: currentPlan,
      mrrAmount: currentMrr,
      billingCycle: rng() < 0.3 ? "annual" : "monthly",
      status,
      startDate: company.signupDate,
      endDate,
    });

    finalizedCompanies.push({
      ...company,
      customerStage: assignCustomerStage(health.healthFactor, monthsSinceSignup, isChurned),
    });
  }

  return { companies: finalizedCompanies, subscriptions, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/subscriptions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/generate/subscriptions.ts backend/platform/generate/subscriptions.test.ts
git commit -m "feat(backend): add subscription/subscription_event generator with MRR waterfall support"
```

---

### Task 7: Product event generator

**Files:**
- Create: `backend/platform/generate/events.ts`
- Test: `backend/platform/generate/events.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `pickWeighted`, `randomInt`, `randomDateBetween` from Task 3; `CompanyRow`, `UserRow`, `HealthProfile`, `ProductEventRow`, `DeviceType` from Task 3; the finalized `companies` array from Task 6's `generateSubscriptionsAndEvents`; `UserRow[]` from Task 5's `generateUsers`.
- Produces: `generateProductEvents(companies, users, healthProfiles, totalEvents, seed, now): ProductEventRow[]` — consumed by Task 9. Guarantees `.length === totalEvents` exactly.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/generate/events.test.ts
import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateUsers } from "./users";
import { generateSubscriptionsAndEvents } from "./subscriptions";
import { generateProductEvents } from "./events";

describe("generateProductEvents", () => {
  const now = new Date("2026-07-27");

  it("generates exactly the requested total, all with unique ids", () => {
    const { companies, healthProfiles } = generateCompanies(200, 31, now);
    const users = generateUsers(companies, 32, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 33, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 5000, 34, now);

    expect(events).toHaveLength(5000);
    expect(new Set(events.map((e) => e.id)).size).toBe(5000);
  });

  it("gives healthier companies' users more events on average", () => {
    const { companies, healthProfiles } = generateCompanies(300, 35, now);
    const users = generateUsers(companies, 36, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 37, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 20000, 38, now);

    const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h.healthFactor]));
    const eventsByUser = new Map<string, number>();
    for (const e of events) eventsByUser.set(e.userId, (eventsByUser.get(e.userId) ?? 0) + 1);

    let healthySum = 0, healthyCount = 0, unhealthySum = 0, unhealthyCount = 0;
    for (const u of users) {
      const health = healthByCompany.get(u.companyId)!;
      const count = eventsByUser.get(u.id) ?? 0;
      if (health >= 70) { healthySum += count; healthyCount++; }
      else if (health < 30) { unhealthySum += count; unhealthyCount++; }
    }

    expect(healthySum / healthyCount).toBeGreaterThan(unhealthySum / unhealthyCount);
  });

  it("only uses event names from the known catalog", () => {
    const { companies, healthProfiles } = generateCompanies(50, 39, now);
    const users = generateUsers(companies, 40, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 41, now);
    const events = generateProductEvents(sub.companies, users, healthProfiles, 1000, 42, now);

    const known = new Set([
      "user_login", "user_logout", "dashboard_viewed", "report_created", "report_exported",
      "analytics_viewed", "data_uploaded", "integration_connected", "automation_created",
      "workflow_created", "api_call", "team_member_invited", "billing_page_viewed",
      "pricing_page_viewed", "help_center_viewed", "support_requested",
    ]);
    for (const e of events) expect(known.has(e.eventName)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/events.test.ts`
Expected: FAIL — `./events` module not found.

- [ ] **Step 3: Write the generator**

```ts
// backend/platform/generate/events.ts
import { mulberry32, pickWeighted, randomInt, randomDateBetween } from "./rng";
import type { CompanyRow, UserRow, HealthProfile, ProductEventRow, DeviceType } from "./types";

const EVENT_CATALOG: { name: string; weight: number; feature: string | null }[] = [
  { name: "user_login", weight: 25, feature: null },
  { name: "user_logout", weight: 20, feature: null },
  { name: "dashboard_viewed", weight: 15, feature: "dashboard" },
  { name: "analytics_viewed", weight: 10, feature: "analytics" },
  { name: "report_created", weight: 6, feature: "reports" },
  { name: "report_exported", weight: 4, feature: "reports" },
  { name: "data_uploaded", weight: 4, feature: "data_import" },
  { name: "integration_connected", weight: 2, feature: "integrations" },
  { name: "automation_created", weight: 2, feature: "automation" },
  { name: "workflow_created", weight: 2, feature: "workflows" },
  { name: "api_call", weight: 5, feature: "api" },
  { name: "team_member_invited", weight: 1, feature: "team" },
  { name: "billing_page_viewed", weight: 1, feature: "billing" },
  { name: "pricing_page_viewed", weight: 1, feature: "billing" },
  { name: "help_center_viewed", weight: 1.5, feature: "support" },
  { name: "support_requested", weight: 0.5, feature: "support" },
];

const DEVICE_TYPES: { value: DeviceType; weight: number }[] = [
  { value: "desktop", weight: 70 },
  { value: "mobile", weight: 25 },
  { value: "tablet", weight: 5 },
];

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function buildEvent(
  id: string,
  user: UserRow,
  activeSince: Date,
  now: Date,
  rng: () => number,
): ProductEventRow {
  const entry = pickWeighted(rng, EVENT_CATALOG.map((e) => ({ value: e, weight: e.weight })));
  return {
    id,
    userId: user.id,
    companyId: user.companyId,
    timestamp: randomDateBetween(rng, activeSince, now).toISOString(),
    eventName: entry.name,
    featureName: entry.feature,
    sessionDuration: randomInt(rng, 30, 1800),
    deviceType: pickWeighted(rng, DEVICE_TYPES),
  };
}

export function generateProductEvents(
  companies: CompanyRow[],
  users: UserRow[],
  healthProfiles: HealthProfile[],
  totalEvents: number,
  seed: number,
  now: Date,
): ProductEventRow[] {
  const rng = mulberry32(seed);
  const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h]));
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 12);

  const weighted = users.map((user) => {
    const health = healthByCompany.get(user.companyId)!;
    const activeSince = new Date(Math.max(new Date(user.createdAt).getTime(), windowStart.getTime()));
    const activeMonths = Math.max(1, monthsBetween(activeSince, now));
    const monthlyRate = 0.5 + (health.healthFactor / 100) * 4.5;
    return { user, activeSince, weight: monthlyRate * activeMonths };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const events: ProductEventRow[] = [];
  let counter = 1;
  const nextId = () => `EVT-${String(counter++).padStart(6, "0")}`;

  for (const { user, activeSince, weight } of weighted) {
    const count = Math.round((weight / totalWeight) * totalEvents);
    for (let i = 0; i < count; i++) {
      events.push(buildEvent(nextId(), user, activeSince, now, rng));
    }
  }

  if (events.length > totalEvents) {
    events.length = totalEvents;
  } else {
    let i = 0;
    while (events.length < totalEvents && weighted.length > 0) {
      const { user, activeSince } = weighted[i % weighted.length];
      events.push(buildEvent(nextId(), user, activeSince, now, rng));
      i++;
    }
  }

  return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/generate/events.ts backend/platform/generate/events.test.ts
git commit -m "feat(backend): add product event generator with health-weighted volume"
```

---

### Task 8: Support ticket generator

**Files:**
- Create: `backend/platform/generate/tickets.ts`
- Test: `backend/platform/generate/tickets.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `randomInt`, `randomDateBetween`, `pickWeighted` from Task 3; `CompanyRow`, `UserRow`, `HealthProfile`, `SupportTicketRow` from Task 3; finalized `companies` from Task 6; `users` from Task 5.
- Produces: `generateSupportTickets(companies, users, healthProfiles, seed, now): SupportTicketRow[]` — consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/generate/tickets.test.ts
import { describe, it, expect } from "vitest";
import { generateCompanies } from "./companies";
import { generateUsers } from "./users";
import { generateSubscriptionsAndEvents } from "./subscriptions";
import { generateSupportTickets } from "./tickets";

describe("generateSupportTickets", () => {
  const now = new Date("2026-07-27");

  it("generates unhealthy companies more tickets on average than healthy ones", () => {
    const { companies, healthProfiles } = generateCompanies(400, 51, now);
    const users = generateUsers(companies, 52, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 53, now);
    const tickets = generateSupportTickets(sub.companies, users, healthProfiles, 54, now);

    const byCompany = new Map<string, number>();
    for (const t of tickets) byCompany.set(t.companyId, (byCompany.get(t.companyId) ?? 0) + 1);

    const healthy = healthProfiles.filter((h) => h.healthFactor >= 70).map((h) => byCompany.get(h.companyId) ?? 0);
    const unhealthy = healthProfiles.filter((h) => h.healthFactor < 30).map((h) => byCompany.get(h.companyId) ?? 0);
    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;

    expect(avg(unhealthy)).toBeGreaterThan(avg(healthy));
  });

  it("ties each ticket's user_id to a user of the same company when one exists", () => {
    const { companies, healthProfiles } = generateCompanies(100, 55, now);
    const users = generateUsers(companies, 56, now);
    const sub = generateSubscriptionsAndEvents(companies, healthProfiles, 57, now);
    const tickets = generateSupportTickets(sub.companies, users, healthProfiles, 58, now);

    const usersByCompany = new Map<string, Set<string>>();
    for (const u of users) {
      const set = usersByCompany.get(u.companyId) ?? new Set<string>();
      set.add(u.id);
      usersByCompany.set(u.companyId, set);
    }
    for (const t of tickets) {
      if (t.userId) expect(usersByCompany.get(t.companyId)?.has(t.userId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/tickets.test.ts`
Expected: FAIL — `./tickets` module not found.

- [ ] **Step 3: Write the generator**

```ts
// backend/platform/generate/tickets.ts
import { mulberry32, randomInt, randomDateBetween, pickWeighted } from "./rng";
import type { CompanyRow, UserRow, HealthProfile, SupportTicketRow } from "./types";

type Priority = SupportTicketRow["priority"];

const NORMAL_PRIORITIES: { value: Priority; weight: number }[] = [
  { value: "low", weight: 40 },
  { value: "medium", weight: 35 },
  { value: "high", weight: 20 },
  { value: "urgent", weight: 5 },
];

const AT_RISK_PRIORITIES: { value: Priority; weight: number }[] = [
  { value: "low", weight: 10 },
  { value: "medium", weight: 20 },
  { value: "high", weight: 40 },
  { value: "urgent", weight: 30 },
];

const SUBJECTS = [
  "Login issues", "Dashboard not loading", "Report export failed", "Billing question",
  "Integration not syncing", "API rate limit", "Feature request", "Data discrepancy",
  "Onboarding help", "Performance issue",
];

export function generateSupportTickets(
  companies: CompanyRow[],
  users: UserRow[],
  healthProfiles: HealthProfile[],
  seed: number,
  now: Date,
): SupportTicketRow[] {
  const rng = mulberry32(seed);
  const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h]));
  const usersByCompany = new Map<string, UserRow[]>();
  for (const user of users) {
    const list = usersByCompany.get(user.companyId) ?? [];
    list.push(user);
    usersByCompany.set(user.companyId, list);
  }

  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 12);

  const tickets: SupportTicketRow[] = [];
  let counter = 1;

  for (const company of companies) {
    const health = healthByCompany.get(company.id)!;
    const companyUsers = usersByCompany.get(company.id) ?? [];
    const ticketCount = Math.round(((100 - health.healthFactor) / 100) * randomInt(rng, 0, 8));

    for (let i = 0; i < ticketCount; i++) {
      const createdAt = randomDateBetween(rng, windowStart, now);
      const isResolved = rng() < 0.8;
      const priority = pickWeighted(
        rng,
        health.healthFactor < 40 ? AT_RISK_PRIORITIES : NORMAL_PRIORITIES,
      );

      tickets.push({
        id: `TKT-${String(counter++).padStart(5, "0")}`,
        companyId: company.id,
        userId: companyUsers.length > 0 ? companyUsers[randomInt(rng, 0, companyUsers.length - 1)].id : null,
        subject: SUBJECTS[randomInt(rng, 0, SUBJECTS.length - 1)],
        priority,
        status: isResolved ? "closed" : rng() < 0.5 ? "open" : "pending",
        createdAt: createdAt.toISOString(),
        resolvedAt: isResolved ? randomDateBetween(rng, createdAt, now).toISOString() : null,
      });
    }
  }

  return tickets;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/generate/tickets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/generate/tickets.ts backend/platform/generate/tickets.test.ts
git commit -m "feat(backend): add support ticket generator correlated with company health"
```

---

### Task 9: Seed orchestration (batch insert + ensureSeeded)

**Files:**
- Create: `backend/platform/seed.ts`
- Test: `backend/platform/seed.test.ts`

**Interfaces:**
- Consumes: `db` from Task 1; all generators from Tasks 4–8; all row types from Task 3.
- Produces: `ensureSeeded(): Promise<void>` — consumed by Task 10's API endpoints (called at the top of every handler, matching the `ensureSeeded()`-on-first-request pattern from Healthcare Claims' `claims/seed.ts`).

If `db.rawExec` does not exist on the generated `db` type when you write this task, check `node_modules/encore.dev/storage/sqldb/*.d.ts` for the actual raw-query method name (Encore's SQLDatabase class exposes raw-SQL variants alongside the tagged-template ones) and use that name instead — the batching approach below is what matters, not the exact method name.

- [ ] **Step 1: Write the failing test**

```ts
// backend/platform/seed.test.ts
import { describe, it, expect } from "vitest";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("ensureSeeded", () => {
  it("populates all raw tables at target volumes", async () => {
    await ensureSeeded();

    const companies = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    expect(companies?.n).toBe(1000);

    const users = await db.queryRow`SELECT COUNT(*)::int AS n FROM users`;
    expect(users?.n).toBeGreaterThan(0);

    const events = await db.queryRow`SELECT COUNT(*)::int AS n FROM product_events`;
    expect(events?.n).toBe(100000);

    const subs = await db.queryRow`SELECT COUNT(*)::int AS n FROM subscriptions`;
    expect(subs?.n).toBe(1000);

    const subEvents = await db.queryRow`SELECT COUNT(*)::int AS n FROM subscription_events`;
    expect(subEvents?.n).toBeGreaterThan(0);

    const churned = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies WHERE customer_stage = 'churned'`;
    expect(churned?.n).toBeGreaterThan(0);

    // Hidden generation variables must never reach the schema.
    const companyColumns = db.query<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'
    `;
    const names = new Set<string>();
    for await (const c of companyColumns) names.add(c.column_name);
    expect(names.has("health_factor")).toBe(false);
    expect(names.has("true_churn_probability")).toBe(false);
  });

  it("is idempotent — a second call does not duplicate rows", async () => {
    await ensureSeeded();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    await ensureSeeded();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
    expect(after?.n).toBe(before?.n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/seed.test.ts`
Expected: FAIL — `./seed` module not found.

- [ ] **Step 3: Write the seed orchestration**

```ts
// backend/platform/seed.ts
import { db } from "./db";
import { generateCompanies } from "./generate/companies";
import { generateUsers } from "./generate/users";
import { generateSubscriptionsAndEvents } from "./generate/subscriptions";
import { generateProductEvents } from "./generate/events";
import { generateSupportTickets } from "./generate/tickets";
import type {
  CompanyRow, UserRow, SubscriptionRow, SubscriptionEventRow, ProductEventRow, SupportTicketRow,
} from "./generate/types";

const SEED = 42;
const COMPANY_COUNT = 1000;
const TOTAL_EVENTS = 100_000;

let seeded: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seeded) seeded = doSeed();
  return seeded;
}

async function doSeed(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
  if (existing && existing.n > 0) return;

  const now = new Date();
  const { companies, healthProfiles } = generateCompanies(COMPANY_COUNT, SEED, now);
  const users = generateUsers(companies, SEED + 1, now);
  const subResult = generateSubscriptionsAndEvents(companies, healthProfiles, SEED + 2, now);
  const events = generateProductEvents(subResult.companies, users, healthProfiles, TOTAL_EVENTS, SEED + 3, now);
  const tickets = generateSupportTickets(subResult.companies, users, healthProfiles, SEED + 4, now);

  await insertCompanies(subResult.companies);
  await insertUsers(users);
  await insertSubscriptions(subResult.subscriptions);
  await insertSubscriptionEvents(subResult.events);
  await insertProductEvents(events);
  await insertSupportTickets(tickets);
}

async function batchInsert(
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueClauses: string[] = [];
    const params: unknown[] = [];
    batch.forEach((row, rowIdx) => {
      const placeholders = row.map((_, colIdx) => `$${rowIdx * row.length + colIdx + 1}`);
      valueClauses.push(`(${placeholders.join(", ")})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueClauses.join(", ")}`;
    await db.rawExec(sql, ...params);
  }
}

function insertCompanies(rows: CompanyRow[]): Promise<void> {
  return batchInsert(
    "companies",
    ["id", "name", "industry", "company_size", "plan_tier", "customer_stage", "signup_date"],
    rows.map((r) => [r.id, r.name, r.industry, r.companySize, r.planTier, r.customerStage, r.signupDate]),
  );
}

function insertUsers(rows: UserRow[]): Promise<void> {
  return batchInsert(
    "users",
    ["id", "company_id", "email", "role", "first_login_at", "last_login_at", "is_active"],
    rows.map((r) => [r.id, r.companyId, r.email, r.role, r.firstLoginAt, r.lastLoginAt, r.isActive]),
  );
}

function insertSubscriptions(rows: SubscriptionRow[]): Promise<void> {
  return batchInsert(
    "subscriptions",
    ["id", "company_id", "plan_name", "mrr_amount", "billing_cycle", "status", "start_date", "end_date"],
    rows.map((r) => [r.id, r.companyId, r.planName, r.mrrAmount, r.billingCycle, r.status, r.startDate, r.endDate]),
  );
}

function insertSubscriptionEvents(rows: SubscriptionEventRow[]): Promise<void> {
  return batchInsert(
    "subscription_events",
    ["subscription_event_id", "company_id", "event_date", "event_type", "previous_plan", "new_plan", "mrr_change"],
    rows.map((r) => [r.id, r.companyId, r.eventDate, r.eventType, r.previousPlan, r.newPlan, r.mrrChange]),
  );
}

function insertProductEvents(rows: ProductEventRow[]): Promise<void> {
  return batchInsert(
    "product_events",
    ["event_id", "user_id", "company_id", "timestamp", "event_name", "feature_name", "session_duration", "device_type"],
    rows.map((r) => [r.id, r.userId, r.companyId, r.timestamp, r.eventName, r.featureName, r.sessionDuration, r.deviceType]),
  );
}

function insertSupportTickets(rows: SupportTicketRow[]): Promise<void> {
  return batchInsert(
    "support_tickets",
    ["id", "company_id", "user_id", "subject", "priority", "status", "created_at", "resolved_at"],
    rows.map((r) => [r.id, r.companyId, r.userId, r.subject, r.priority, r.status, r.createdAt, r.resolvedAt]),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/seed.test.ts`
Expected: PASS (this seeds the full 1000/5000/100000-row dataset into the local test database — allow it a little longer than the earlier unit tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/seed.ts backend/platform/seed.test.ts
git commit -m "feat(backend): wire seed orchestration with batched inserts"
```

---

### Task 10: API endpoints (/companies/count, /companies, /metrics/overview)

**Files:**
- Modify: `backend/platform/api.ts` (adds to the `health` endpoint from Task 1)
- Test: `backend/platform/api.test.ts` (extends Task 1's test file)

**Interfaces:**
- Consumes: `db` from Task 1; `ensureSeeded` from Task 9.
- Produces: `companiesCount`, `listCompanies`, `metricsOverview` exported Encore API handlers — consumed by the frontend in Tasks 11–12.

- [ ] **Step 1: Extend the test file with failing tests**

```ts
// backend/platform/api.test.ts (append to the existing file from Task 1)
import { companiesCount, listCompanies, metricsOverview } from "./api";

describe("companiesCount", () => {
  it("totals match active + churned", async () => {
    const res = await companiesCount();
    expect(res.total_companies).toBe(1000);
    expect(res.active_companies + res.churned_companies).toBe(res.total_companies);
    expect(res.churned_companies).toBeGreaterThan(0);
  });
});

describe("listCompanies", () => {
  it("paginates results", async () => {
    const res = await listCompanies({ page: 1, pageSize: 10 });
    expect(res.companies).toHaveLength(10);
    expect(res.total).toBe(1000);
  });

  it("filters by planTier", async () => {
    const res = await listCompanies({ planTier: "enterprise", pageSize: 100 });
    expect(res.companies.every((c) => c.plan_tier === "enterprise")).toBe(true);
    expect(res.companies.length).toBeGreaterThan(0);
  });
});

describe("metricsOverview", () => {
  it("returns non-zero totals", async () => {
    const res = await metricsOverview();
    expect(res.total_companies).toBe(1000);
    expect(res.total_users).toBeGreaterThan(0);
    expect(res.total_events).toBe(100000);
    expect(res.current_mrr).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/api.test.ts`
Expected: FAIL — `companiesCount`, `listCompanies`, `metricsOverview` not exported from `./api`.

- [ ] **Step 3: Add the endpoints**

```ts
// backend/platform/api.ts (add below the existing `health` export)
import { api, Query } from "encore.dev/api";
import { db } from "./db";
import { ensureSeeded } from "./seed";

// ... existing `health` export stays as-is ...

interface CompanyCountResponse {
  total_companies: number;
  active_companies: number;
  churned_companies: number;
}

export const companiesCount = api(
  { method: "GET", path: "/companies/count", expose: true },
  async (): Promise<CompanyCountResponse> => {
    await ensureSeeded();
    const row = await db.queryRow<{ total: number; active: number; churned: number }>`
      WITH churn_status AS (
        SELECT c.id,
          EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.company_id = c.id AND s.status = 'canceled' AND s.end_date <= CURRENT_DATE
          ) AS is_churned
        FROM companies c
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE NOT is_churned)::int AS active,
        COUNT(*) FILTER (WHERE is_churned)::int AS churned
      FROM churn_status
    `;
    return {
      total_companies: row?.total ?? 0,
      active_companies: row?.active ?? 0,
      churned_companies: row?.churned ?? 0,
    };
  },
);

interface ListCompaniesParams {
  page?: Query<number>;
  pageSize?: Query<number>;
  planTier?: Query<string>;
  industry?: Query<string>;
}

interface CompanySummary {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  customer_stage: string;
  mrr: number;
}

export const listCompanies = api(
  { method: "GET", path: "/companies", expose: true },
  async (params: ListCompaniesParams): Promise<{ companies: CompanySummary[]; total: number }> => {
    await ensureSeeded();
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: unknown[] = [];
    if (params.planTier) {
      conditions.push(`c.plan_tier = $${values.length + 1}`);
      values.push(params.planTier);
    }
    if (params.industry) {
      conditions.push(`c.industry = $${values.length + 1}`);
      values.push(params.industry);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await db.rawQueryRow<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM companies c ${whereClause}`,
      ...values,
    );

    const listSql = `
      SELECT c.id, c.name, c.industry, c.plan_tier, c.customer_stage,
        COALESCE(s.mrr_amount, 0) AS mrr
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      ${whereClause}
      ORDER BY c.id
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const rows = db.rawQuery<CompanySummary>(listSql, ...values, pageSize, offset);
    const companies: CompanySummary[] = [];
    for await (const row of rows) companies.push(row);

    return { companies, total: countRow?.n ?? 0 };
  },
);

interface MetricsOverviewResponse {
  total_companies: number;
  total_users: number;
  total_events: number;
  current_mrr: number;
}

export const metricsOverview = api(
  { method: "GET", path: "/metrics/overview", expose: true },
  async (): Promise<MetricsOverviewResponse> => {
    await ensureSeeded();
    const row = await db.queryRow<{
      total_companies: number; total_users: number; total_events: number; current_mrr: number;
    }>`
      SELECT
        (SELECT COUNT(*)::int FROM companies) AS total_companies,
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM product_events) AS total_events,
        (SELECT COALESCE(SUM(mrr_amount), 0)::float FROM subscriptions WHERE status = 'active') AS current_mrr
    `;
    return {
      total_companies: row?.total_companies ?? 0,
      total_users: row?.total_users ?? 0,
      total_events: row?.total_events ?? 0,
      current_mrr: row?.current_mrr ?? 0,
    };
  },
);
```

Note: remove the duplicate `import { api } from "encore.dev/api"` already at the top of `api.ts` from Task 1 — merge it into the single `import { api, Query } from "encore.dev/api"` line shown above, and add `import { ensureSeeded } from "./seed"` and `import { db } from "./db"` alongside it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npx vitest run platform/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): add companies/count, companies, and metrics/overview endpoints"
```

---

### Task 11: Frontend scaffold (Next.js 15 + Tailwind + shadcn/ui)

**Files:**
- Create: `frontend/` (via `create-next-app`)
- Create: `frontend/.env.local.example`
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/api.ts`

**Interfaces:**
- Produces: `MetricsOverview`, `CompanySummary`, `CompaniesResponse` types; `getMetricsOverview(): Promise<MetricsOverview>`, `getCompanies(pageSize?: number): Promise<CompaniesResponse>` — consumed by Task 12's `/dashboard` page. Response field names (`total_companies`, `plan_tier`, etc.) must match Task 10's API responses exactly.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Initialize shadcn/ui and add the components this phase needs**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend"
npx shadcn@latest init -d
npx shadcn@latest add card table badge
```

- [ ] **Step 3: Write the env example**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Save as `frontend/.env.local.example`, then copy it to `frontend/.env.local` (gitignored) for local dev.

- [ ] **Step 4: Write the response types**

```ts
// frontend/lib/types.ts
export interface MetricsOverview {
  total_companies: number;
  total_users: number;
  total_events: number;
  current_mrr: number;
}

export interface CompanySummary {
  id: string;
  name: string;
  industry: string;
  plan_tier: string;
  customer_stage: string;
  mrr: number;
}

export interface CompaniesResponse {
  companies: CompanySummary[];
  total: number;
}
```

- [ ] **Step 5: Write the API client**

```ts
// frontend/lib/api.ts
import type { CompaniesResponse, MetricsOverview } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function getMetricsOverview(): Promise<MetricsOverview> {
  const res = await fetch(`${API}/metrics/overview`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /metrics/overview failed: ${res.status}`);
  return res.json();
}

export async function getCompanies(pageSize = 25): Promise<CompaniesResponse> {
  const res = await fetch(`${API}/companies?pageSize=${pageSize}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /companies failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 6: Verify with the type checker (not `next dev`/`next build`)**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/next.config.* frontend/tailwind.config.* frontend/postcss.config.* frontend/app frontend/lib frontend/components frontend/components.json frontend/.gitignore frontend/.env.local.example
git commit -m "feat(frontend): scaffold Next.js 15 app with Tailwind, shadcn/ui, and API client"
```

---

### Task 12: `/dashboard` page

**Files:**
- Create: `frontend/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getMetricsOverview`, `getCompanies` from Task 11's `lib/api.ts`; `MetricsOverview`, `CompanySummary` types from Task 11's `lib/types.ts`; shadcn `Card`/`Table`/`Badge` components from Task 11.

- [ ] **Step 1: Write the dashboard page**

```tsx
// frontend/app/dashboard/page.tsx
import { getCompanies, getMetricsOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DashboardPage() {
  const [metrics, companies] = await Promise.all([getMetricsOverview(), getCompanies(25)]);

  const kpis = [
    { label: "Total Companies", value: metrics.total_companies.toLocaleString() },
    { label: "Total Users", value: metrics.total_users.toLocaleString() },
    { label: "Product Events", value: metrics.total_events.toLocaleString() },
    { label: "Current MRR", value: formatCurrency(metrics.current_mrr) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Executive Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{kpi.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Customer Stage</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.industry}</TableCell>
                  <TableCell className="capitalize">{c.plan_tier}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.customer_stage === "at_risk" || c.customer_stage === "churned"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {c.customer_stage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(c.mrr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification against the real backend**

With the Encore backend running (`encore run` from `backend/`, Task 1 Step 13) and `frontend/.env.local` pointing at it, start the frontend briefly to confirm real data renders — do not leave a long-running `next dev` session open (see Global Constraints):

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && timeout 30 npm run dev &
```

Open `http://localhost:3000/dashboard` in a browser and confirm the four KPI cards show non-zero values matching `curl http://localhost:4000/metrics/overview`, and the customer table lists real company names. Stop the dev server afterward.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/dashboard/page.tsx
git commit -m "feat(frontend): add /dashboard page with live KPI cards and customer table"
```

---

### Task 13: ml-service stub (FastAPI health check)

**Files:**
- Create: `ml-service/main.py`
- Create: `ml-service/requirements.txt`
- Test: `ml-service/test_main.py`

**Interfaces:**
- Produces: `GET /health` on the FastAPI app — proves the service is deployable to Railway; Phase 5/6 add real ML endpoints alongside it.

- [ ] **Step 1: Write requirements.txt**

```
fastapi==0.115.0
uvicorn==0.30.6
httpx==0.27.2
pytest==8.3.3
```

- [ ] **Step 2: Set up a virtual environment and install**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 3: Write the failing test**

```python
# ml-service/test_main.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && source .venv/bin/activate && pytest test_main.py -v`
Expected: FAIL — `main` module not found.

- [ ] **Step 5: Write the FastAPI stub**

```python
# ml-service/main.py
from fastapi import FastAPI

app = FastAPI(title="SaaSPulse AI ML Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && source .venv/bin/activate && pytest test_main.py -v`
Expected: PASS

- [ ] **Step 7: Write a .gitignore for the venv**

```
.venv/
__pycache__/
*.pyc
```

Save as `ml-service/.gitignore`.

- [ ] **Step 8: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add ml-service/main.py ml-service/requirements.txt ml-service/test_main.py ml-service/.gitignore
git commit -m "feat(ml-service): add FastAPI health-check stub"
```

---

### Task 14: README, DEPLOY docs, final verification

**Files:**
- Create: `README.md`
- Create: `DEPLOY.md`

**Interfaces:**
- Consumes: nothing new — documents Tasks 1–13.

- [ ] **Step 1: Write README.md**

```markdown
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
cd backend && npm test
cd ml-service && source .venv/bin/activate && pytest
```
```

- [ ] **Step 2: Write DEPLOY.md**

```markdown
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
```

- [ ] **Step 3: Run the full backend test suite**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && npm test`
Expected: all tests pass (schema, rng, companies, users, subscriptions, events, tickets, seed, api).

- [ ] **Step 4: Run the frontend type check**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the ml-service test**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && source .venv/bin/activate && pytest test_main.py -v`
Expected: PASS

- [ ] **Step 6: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add README.md DEPLOY.md
git commit -m "docs: add README and deployment instructions for Phase 1"
git push origin main
```

---
