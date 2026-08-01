import type { ProductEventRow } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTenureDays(signupDate: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - signupDate.getTime()) / MS_PER_DAY));
}

export function computeRecencyDays(
  companyEvents: ProductEventRow[],
  tenureDays: number,
  now: Date,
): number {
  if (companyEvents.length === 0) return tenureDays;

  let mostRecent = companyEvents[0].timestamp;
  for (const e of companyEvents) {
    if (e.timestamp > mostRecent) mostRecent = e.timestamp;
  }
  return Math.max(0, Math.round((now.getTime() - mostRecent.getTime()) / MS_PER_DAY));
}
