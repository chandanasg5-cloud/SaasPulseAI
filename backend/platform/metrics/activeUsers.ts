import type { ProductEventRow, UserRow } from "./types";

export function countActiveUsers(companyUsers: UserRow[], companyEvents: ProductEventRow[], now: Date): number {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const activeUserIds = new Set<string>();
  for (const e of companyEvents) {
    if (e.timestamp >= windowStart) activeUserIds.add(e.user_id);
  }
  return companyUsers.filter((u) => activeUserIds.has(u.id)).length;
}
