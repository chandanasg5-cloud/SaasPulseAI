import type { ProductEventRow } from "./types";

export function computeFeatureAdoptionRate(events: ProductEventRow[], now: Date): number {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStart = new Date(todayStart.getTime() - 29 * 86_400_000);

  const featuresByUser = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.timestamp < windowStart) continue;
    const set = featuresByUser.get(e.user_id) ?? new Set<string>();
    if (e.feature_name) set.add(e.feature_name);
    featuresByUser.set(e.user_id, set);
  }

  const activeUserIds = [...featuresByUser.keys()];
  if (activeUserIds.length === 0) return 0;

  const adopted = activeUserIds.filter((id) => (featuresByUser.get(id)?.size ?? 0) >= 3).length;
  return (adopted / activeUserIds.length) * 100;
}
