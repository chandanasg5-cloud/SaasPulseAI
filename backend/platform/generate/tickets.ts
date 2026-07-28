import { mulberry32, randomInt, randomDateBetween, pickWeighted } from "./rng";
import type { CompanyRow, UserRow, HealthProfile, SupportTicketRow } from "./types";

type Priority = SupportTicketRow["priority"];

const NORMAL_PRIORITIES: { value: Priority; weight: number }[] = [
  { value: "low", weight: 40 },
  { value: "medium", weight: 35 },
  { value: "high", weight: 20 },
  { value: "urgent", weight: 5 },
];

const AT_RISK_PRIORITIES: { value: Priority; weight: number }[] = [
  { value: "low", weight: 10 },
  { value: "medium", weight: 20 },
  { value: "high", weight: 40 },
  { value: "urgent", weight: 30 },
];

const SUBJECTS = [
  "Login issues", "Dashboard not loading", "Report export failed", "Billing question",
  "Integration not syncing", "API rate limit", "Feature request", "Data discrepancy",
  "Onboarding help", "Performance issue",
];

export function generateSupportTickets(
  companies: CompanyRow[],
  users: UserRow[],
  healthProfiles: HealthProfile[],
  seed: number,
  now: Date,
): SupportTicketRow[] {
  const rng = mulberry32(seed);
  const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h]));
  const usersByCompany = new Map<string, UserRow[]>();
  for (const user of users) {
    const list = usersByCompany.get(user.companyId) ?? [];
    list.push(user);
    usersByCompany.set(user.companyId, list);
  }

  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 12);

  const tickets: SupportTicketRow[] = [];
  let counter = 1;

  for (const company of companies) {
    const health = healthByCompany.get(company.id)!;
    const companyUsers = usersByCompany.get(company.id) ?? [];
    const ticketCount = Math.round(((100 - health.healthFactor) / 100) * randomInt(rng, 0, 8));

    for (let i = 0; i < ticketCount; i++) {
      const createdAt = randomDateBetween(rng, windowStart, now);
      const isResolved = rng() < 0.8;
      const priority = pickWeighted(
        rng,
        health.healthFactor < 40 ? AT_RISK_PRIORITIES : NORMAL_PRIORITIES,
      );

      tickets.push({
        id: `TKT-${String(counter++).padStart(5, "0")}`,
        companyId: company.id,
        userId: companyUsers.length > 0 ? companyUsers[randomInt(rng, 0, companyUsers.length - 1)].id : null,
        subject: SUBJECTS[randomInt(rng, 0, SUBJECTS.length - 1)],
        priority,
        status: isResolved ? "closed" : rng() < 0.5 ? "open" : "pending",
        createdAt: createdAt.toISOString(),
        resolvedAt: isResolved ? randomDateBetween(rng, createdAt, now).toISOString() : null,
      });
    }
  }

  return tickets;
}
