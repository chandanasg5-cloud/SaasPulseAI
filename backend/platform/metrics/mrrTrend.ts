import type { SubscriptionEventRow } from "./types";
import { endOfMonth, monthKey, trailingMonths } from "./months";

export interface MrrTrendPoint {
  month: string;
  mrr: number;
}

// event_date is a "YYYY-MM-DD" string. `new Date(string)` parses bare date
// strings as UTC midnight, while months.ts builds all boundaries (startOfMonth,
// endOfMonth, trailingMonths) in local time. Comparing a UTC-parsed instant
// against a local-time cutoff silently shifts events by a day in any timezone
// west of UTC. Parse event_date as a local calendar date instead so it lines
// up with the local-time month boundaries it's compared against.
function parseEventDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
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
      .filter((e) => parseEventDate(e.event_date) <= cutoff)
      .reduce((sum, e) => sum + e.mrr_change, 0);
    return { month: monthKey(monthStart), mrr };
  });
}
