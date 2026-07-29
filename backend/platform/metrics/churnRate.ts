import type { CompanyRow, SubscriptionRow } from "./types";
import { endOfMonth, parseLocalDate, startOfMonth } from "./months";

export function computeChurnRate(
  companies: CompanyRow[],
  subscriptions: SubscriptionRow[],
  now: Date,
): number {
  const monthStart = startOfMonth(now);
  const priorCutoff = new Date(monthStart.getTime() - 1);
  const subByCompany = new Map(subscriptions.map((s) => [s.company_id, s]));

  const activeAtMonthStart = companies.filter((c) => {
    if (parseLocalDate(c.signup_date) > priorCutoff) return false;
    const sub = subByCompany.get(c.id);
    if (!sub) return false;
    if (sub.status !== "canceled") return true;
    return sub.end_date !== null && parseLocalDate(sub.end_date) > priorCutoff;
  });

  if (activeAtMonthStart.length === 0) return 0;

  const monthEnd = endOfMonth(now);
  const churnedThisMonth = activeAtMonthStart.filter((c) => {
    const sub = subByCompany.get(c.id)!;
    return (
      sub.status === "canceled" &&
      sub.end_date !== null &&
      parseLocalDate(sub.end_date) >= monthStart &&
      parseLocalDate(sub.end_date) <= monthEnd
    );
  }).length;

  return churnedThisMonth / activeAtMonthStart.length;
}
