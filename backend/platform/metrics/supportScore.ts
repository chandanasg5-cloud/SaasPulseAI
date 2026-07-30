import type { SupportTicketRow } from "./types";

const PRIORITY_WEIGHT: Record<SupportTicketRow["priority"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 5,
};

export function computeSupportScore(companyTickets: SupportTicketRow[], now: Date): number {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);

  const penalty = companyTickets
    .filter((t) => t.created_at >= windowStart)
    .reduce((sum, t) => sum + PRIORITY_WEIGHT[t.priority], 0);

  return Math.max(0, 25 - penalty);
}
