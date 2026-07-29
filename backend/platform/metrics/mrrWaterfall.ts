import type { SubscriptionEventRow } from "./types";
import { endOfMonth, startOfMonth } from "./months";

export interface MrrWaterfall {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

// event_date is a "YYYY-MM-DD" string. `new Date(string)` parses bare date
// strings as UTC midnight, while months.ts builds all boundaries (startOfMonth,
// endOfMonth) in local time. Comparing a UTC-parsed instant against a
// local-time boundary silently shifts events by a day in any timezone west of
// UTC. Parse event_date as a local calendar date instead so it lines up with
// the local-time month boundaries it's compared against.
function parseEventDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function computeMrrWaterfall(events: SubscriptionEventRow[], now: Date): MrrWaterfall {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const startingMrr = events
    .filter((e) => parseEventDate(e.event_date) < monthStart)
    .reduce((sum, e) => sum + e.mrr_change, 0);

  const inMonth = events.filter((e) => {
    const d = parseEventDate(e.event_date);
    return d >= monthStart && d <= monthEnd;
  });

  const sumByType = (type: SubscriptionEventRow["event_type"]) =>
    inMonth.filter((e) => e.event_type === type).reduce((sum, e) => sum + e.mrr_change, 0);

  const newMrr = sumByType("new_subscription");
  const expansionMrr = sumByType("upgrade");
  const contractionMrr = sumByType("downgrade");
  const churnedMrr = sumByType("cancellation");

  return {
    starting_mrr: startingMrr,
    new_mrr: newMrr,
    expansion_mrr: expansionMrr,
    contraction_mrr: contractionMrr,
    churned_mrr: churnedMrr,
    ending_mrr: startingMrr + newMrr + expansionMrr + contractionMrr + churnedMrr,
  };
}
