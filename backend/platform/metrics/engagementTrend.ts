import type { ProductEventRow } from "./types";

export interface EngagementTrendPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeEngagementTrend(
  events: ProductEventRow[],
  now: Date,
  dayCount = 30,
): EngagementTrendPoint[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const points: EngagementTrendPoint[] = [];

  for (let i = dayCount - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * 86_400_000);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
    const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
    const monthStart = new Date(dayStart.getTime() - 29 * 86_400_000);

    const dau = new Set<string>();
    const wau = new Set<string>();
    const mau = new Set<string>();

    for (const e of events) {
      const t = e.timestamp;
      if (t > dayEnd) continue;
      if (t >= monthStart) mau.add(e.user_id);
      if (t >= weekStart) wau.add(e.user_id);
      if (t >= dayStart) dau.add(e.user_id);
    }

    points.push({ date: dateKey(dayStart), dau: dau.size, wau: wau.size, mau: mau.size });
  }

  return points;
}
