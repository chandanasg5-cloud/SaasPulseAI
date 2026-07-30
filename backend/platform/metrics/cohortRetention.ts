import type { ProductEventRow, UserRow } from "./types";
import { monthKey, trailingMonths } from "./months";

export interface CohortRetentionCell {
  cohort_month: string;
  months_since_signup: number;
  retention_pct: number;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function computeCohortRetention(
  users: UserRow[],
  events: ProductEventRow[],
  now: Date,
  cohortMonths = 12,
): CohortRetentionCell[] {
  const cohorts = new Map<string, string[]>();
  for (const u of users) {
    const key = monthKey(u.created_at);
    const arr = cohorts.get(key) ?? [];
    arr.push(u.id);
    cohorts.set(key, arr);
  }

  const activeMonthsByUser = new Map<string, Set<string>>();
  for (const e of events) {
    const key = monthKey(e.timestamp);
    const set = activeMonthsByUser.get(e.user_id) ?? new Set<string>();
    set.add(key);
    activeMonthsByUser.set(e.user_id, set);
  }

  const cells: CohortRetentionCell[] = [];

  for (const cohortMonthDate of trailingMonths(now, cohortMonths)) {
    const cohortKey = monthKey(cohortMonthDate);
    const cohortUserIds = cohorts.get(cohortKey);
    if (!cohortUserIds || cohortUserIds.length === 0) continue;

    const maxOffset = monthsBetween(cohortMonthDate, now);
    for (let offset = 0; offset <= maxOffset; offset++) {
      const targetMonth = new Date(cohortMonthDate.getFullYear(), cohortMonthDate.getMonth() + offset, 1);
      const targetKey = monthKey(targetMonth);
      const retained = cohortUserIds.filter((id) => activeMonthsByUser.get(id)?.has(targetKey)).length;
      cells.push({
        cohort_month: cohortKey,
        months_since_signup: offset,
        retention_pct: (retained / cohortUserIds.length) * 100,
      });
    }
  }

  return cells;
}
