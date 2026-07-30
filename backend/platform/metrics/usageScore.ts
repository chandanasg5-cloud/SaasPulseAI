import type { ProductEventRow, UserRow } from "./types";

export function computeUsageScore(
  companyUsers: UserRow[],
  companyEvents: ProductEventRow[],
  now: Date,
): number {
  if (companyUsers.length === 0) return 0;

  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const activeUserIds = new Set<string>();
  for (const e of companyEvents) {
    if (e.timestamp >= windowStart) activeUserIds.add(e.user_id);
  }

  const activeCount = companyUsers.filter((u) => activeUserIds.has(u.id)).length;
  return (activeCount / companyUsers.length) * 25;
}
