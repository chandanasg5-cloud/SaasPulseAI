import type { ProductEventRow, UserRow } from "./types";
import { countActiveUsers } from "./activeUsers";

export function computeSeatPenetrationScore(
  companyUsers: UserRow[],
  companyEvents: ProductEventRow[],
  companySize: number,
  now: Date,
): number {
  if (companySize <= 0) return 0;
  const activeCount = countActiveUsers(companyUsers, companyEvents, now);
  return Math.max(0, Math.min(25, (activeCount / companySize) * 25));
}
