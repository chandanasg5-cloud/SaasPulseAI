import type { ProductEventRow } from "./types";

export interface FeatureUsageRow {
  feature_name: string;
  event_count: number;
}

export function computeFeatureUsageRanking(events: ProductEventRow[]): FeatureUsageRow[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.feature_name) continue;
    counts.set(e.feature_name, (counts.get(e.feature_name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([feature_name, event_count]) => ({ feature_name, event_count }))
    .sort((a, b) => b.event_count - a.event_count);
}
