import type { CompanyRow, SubscriptionEventRow } from "./types";
import { endOfMonth, parseLocalDate, startOfMonth } from "./months";

export function computeNrr(
  companies: CompanyRow[],
  events: SubscriptionEventRow[],
  now: Date,
): number {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const priorCutoff = new Date(monthStart.getTime() - 1);

  const existingCompanyIds = new Set(
    companies.filter((c) => parseLocalDate(c.signup_date) <= priorCutoff).map((c) => c.id),
  );

  const startingMrr = events
    .filter((e) => existingCompanyIds.has(e.company_id) && parseLocalDate(e.event_date) < monthStart)
    .reduce((sum, e) => sum + e.mrr_change, 0);

  if (startingMrr === 0) return 0;

  const netChangeThisMonth = events
    .filter(
      (e) =>
        existingCompanyIds.has(e.company_id) &&
        e.event_type !== "new_subscription" &&
        parseLocalDate(e.event_date) >= monthStart &&
        parseLocalDate(e.event_date) <= monthEnd,
    )
    .reduce((sum, e) => sum + e.mrr_change, 0);

  return (startingMrr + netChangeThisMonth) / startingMrr;
}
