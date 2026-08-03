import type { SubscriptionEventRow } from "./types";
import { daysAgo, parseLocalDate } from "./months";

export interface MrrWaterfall {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

export function computeMrrWaterfall(events: SubscriptionEventRow[], now: Date): MrrWaterfall {
  const windowStart = daysAgo(now, 30);

  const startingMrr = events
    .filter((e) => parseLocalDate(e.event_date) < windowStart)
    .reduce((sum, e) => sum + e.mrr_change, 0);

  const inWindow = events.filter((e) => {
    const d = parseLocalDate(e.event_date);
    return d >= windowStart && d <= now;
  });

  const sumByType = (type: SubscriptionEventRow["event_type"]) =>
    inWindow.filter((e) => e.event_type === type).reduce((sum, e) => sum + e.mrr_change, 0);

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
