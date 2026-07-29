import type { SubscriptionEventRow } from "./types";
import { endOfMonth, monthKey, parseLocalDate, trailingMonths } from "./months";

export interface MrrTrendPoint {
  month: string;
  mrr: number;
}

export function computeMrrTrend(
  events: SubscriptionEventRow[],
  now: Date,
  monthCount = 12,
): MrrTrendPoint[] {
  const months = trailingMonths(now, monthCount);

  return months.map((monthStart) => {
    const cutoff = endOfMonth(monthStart);
    const mrr = events
      .filter((e) => parseLocalDate(e.event_date) <= cutoff)
      .reduce((sum, e) => sum + e.mrr_change, 0);
    return { month: monthKey(monthStart), mrr };
  });
}
