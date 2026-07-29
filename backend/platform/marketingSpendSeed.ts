import { db } from "./db";
import { generateMarketingSpend } from "./generate/marketingSpend";

let marketingSpendSeeded: Promise<void> | null = null;

export function ensureMarketingSpendSeeded(): Promise<void> {
  if (!marketingSpendSeeded) marketingSpendSeeded = doSeedMarketingSpend();
  return marketingSpendSeeded;
}

/**
 * Exported (in addition to `ensureMarketingSpendSeeded`) so tests can call it
 * directly and bypass the in-process promise cache above. See seed.ts's
 * `doSeed` for why this matters: calling `ensureMarketingSpendSeeded()` twice
 * in the same process just returns the already-resolved promise without
 * re-running this function's body, so the only way to actually exercise the
 * DB-level "already seeded" guard below (`existing.n > 0`) is to invoke
 * `doSeedMarketingSpend()` itself.
 */
export async function doSeedMarketingSpend(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM marketing_spend`;
  if (existing && existing.n > 0) return;

  const rows = db.query<{ month: string; count: number }>`
    SELECT to_char(date_trunc('month', event_date), 'YYYY-MM-DD') AS month,
           COUNT(*)::int AS count
    FROM subscription_events
    WHERE event_type = 'new_subscription' AND mrr_change > 0
    GROUP BY date_trunc('month', event_date)
    ORDER BY date_trunc('month', event_date)
  `;
  const monthly: { month: string; count: number }[] = [];
  for await (const r of rows) monthly.push(r);

  const spendRows = generateMarketingSpend(monthly, 100);

  const tx = await db.begin();
  try {
    for (const row of spendRows) {
      await tx.rawExec(
        `INSERT INTO marketing_spend (id, month, amount) VALUES ($1, $2, $3)`,
        row.id,
        row.month,
        row.amount,
      );
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
