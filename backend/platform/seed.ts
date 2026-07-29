import { db } from "./db";
import { generateCompanies } from "./generate/companies";
import { generateUsers } from "./generate/users";
import { generateSubscriptionsAndEvents } from "./generate/subscriptions";
import { generateProductEvents } from "./generate/events";
import { generateSupportTickets } from "./generate/tickets";
import type {
  CompanyRow, UserRow, SubscriptionRow, SubscriptionEventRow, ProductEventRow, SupportTicketRow,
} from "./generate/types";
import type { Primitive, SQLDatabase, Transaction } from "encore.dev/storage/sqldb";

const SEED = 42;
const COMPANY_COUNT = 1000;
const TOTAL_EVENTS = 100_000;

/** Anything the insert helpers can run raw SQL against: the top-level database handle or an open transaction. */
type Executor = SQLDatabase | Transaction;

let seeded: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seeded) seeded = doSeed();
  return seeded;
}

/**
 * Exported (in addition to `ensureSeeded`) so tests can call it directly and
 * bypass the in-process promise cache above. Calling `ensureSeeded()` twice
 * in the same process just returns the already-resolved promise without
 * re-running this function's body, so the only way to actually exercise the
 * DB-level "already seeded" guard below (`existing.n > 0`) is to invoke
 * `doSeed()` itself.
 */
export async function doSeed(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM companies`;
  if (existing && existing.n > 0) return;

  const now = new Date();
  const { companies, healthProfiles } = generateCompanies(COMPANY_COUNT, SEED, now);
  const users = generateUsers(companies, SEED + 1, now);
  const subResult = generateSubscriptionsAndEvents(companies, healthProfiles, SEED + 2, now);
  const events = generateProductEvents(subResult.companies, users, healthProfiles, TOTAL_EVENTS, SEED + 3, now);
  const tickets = generateSupportTickets(subResult.companies, users, healthProfiles, SEED + 4, now);

  // Wrap every insert in a single transaction. If any batch throws partway
  // through (e.g. a bad product_events batch), the rollback below undoes the
  // earlier companies/users/subscriptions/subscription_events inserts too,
  // so `companies` goes back to 0 rows. That way a future doSeed() call
  // correctly sees "not seeded" (instead of permanently mistaking a
  // partially-seeded DB for a fully-seeded one) and retries cleanly.
  const tx = await db.begin();
  try {
    await insertCompanies(tx, subResult.companies);
    await insertUsers(tx, users);
    await insertSubscriptions(tx, subResult.subscriptions);
    await insertSubscriptionEvents(tx, subResult.events);
    await insertProductEvents(tx, events);
    await insertSupportTickets(tx, tickets);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function batchInsert(
  executor: Executor,
  table: string,
  columns: string[],
  rows: Primitive[][],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueClauses: string[] = [];
    const params: Primitive[] = [];
    batch.forEach((row, rowIdx) => {
      const placeholders = row.map((_, colIdx) => `$${rowIdx * row.length + colIdx + 1}`);
      valueClauses.push(`(${placeholders.join(", ")})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueClauses.join(", ")}`;
    await executor.rawExec(sql, ...params);
  }
}

function insertCompanies(executor: Executor, rows: CompanyRow[]): Promise<void> {
  return batchInsert(
    executor,
    "companies",
    ["id", "name", "industry", "company_size", "plan_tier", "customer_stage", "signup_date"],
    rows.map((r) => [r.id, r.name, r.industry, r.companySize, r.planTier, r.customerStage, r.signupDate]),
  );
}

function insertUsers(executor: Executor, rows: UserRow[]): Promise<void> {
  return batchInsert(
    executor,
    "users",
    ["id", "company_id", "email", "role", "first_login_at", "last_login_at", "is_active"],
    rows.map((r) => [r.id, r.companyId, r.email, r.role, r.firstLoginAt, r.lastLoginAt, r.isActive]),
  );
}

function insertSubscriptions(executor: Executor, rows: SubscriptionRow[]): Promise<void> {
  return batchInsert(
    executor,
    "subscriptions",
    ["id", "company_id", "plan_name", "mrr_amount", "billing_cycle", "status", "start_date", "end_date"],
    rows.map((r) => [r.id, r.companyId, r.planName, r.mrrAmount, r.billingCycle, r.status, r.startDate, r.endDate]),
  );
}

function insertSubscriptionEvents(executor: Executor, rows: SubscriptionEventRow[]): Promise<void> {
  return batchInsert(
    executor,
    "subscription_events",
    ["subscription_event_id", "company_id", "event_date", "event_type", "previous_plan", "new_plan", "mrr_change"],
    rows.map((r) => [r.id, r.companyId, r.eventDate, r.eventType, r.previousPlan, r.newPlan, r.mrrChange]),
  );
}

function insertProductEvents(executor: Executor, rows: ProductEventRow[]): Promise<void> {
  return batchInsert(
    executor,
    "product_events",
    ["event_id", "user_id", "company_id", "timestamp", "event_name", "feature_name", "session_duration", "device_type"],
    rows.map((r) => [r.id, r.userId, r.companyId, r.timestamp, r.eventName, r.featureName, r.sessionDuration, r.deviceType]),
  );
}

function insertSupportTickets(executor: Executor, rows: SupportTicketRow[]): Promise<void> {
  return batchInsert(
    executor,
    "support_tickets",
    ["id", "company_id", "user_id", "subject", "priority", "status", "created_at", "resolved_at"],
    rows.map((r) => [r.id, r.companyId, r.userId, r.subject, r.priority, r.status, r.createdAt, r.resolvedAt]),
  );
}
