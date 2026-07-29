import type { MarketingSpendRow, SubscriptionEventRow } from "./types";
import { parseLocalDate, startOfMonth } from "./months";

export function computeCac(
  spend: MarketingSpendRow[],
  events: SubscriptionEventRow[],
  now: Date,
): number {
  const monthStart = startOfMonth(now);

  const spendRow = spend.find((s) => {
    const d = parseLocalDate(s.month);
    return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth();
  });
  const monthSpend = spendRow?.amount ?? 0;

  const newPayingCustomers = events.filter((e) => {
    const d = parseLocalDate(e.event_date);
    return (
      e.event_type === "new_subscription" &&
      e.mrr_change > 0 &&
      d.getFullYear() === monthStart.getFullYear() &&
      d.getMonth() === monthStart.getMonth()
    );
  }).length;

  return newPayingCustomers === 0 ? 0 : monthSpend / newPayingCustomers;
}
