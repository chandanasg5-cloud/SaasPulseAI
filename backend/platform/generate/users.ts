import { mulberry32, randomInt, randomDateBetween } from "./rng";
import type { CompanyRow, UserRow, PlanTier } from "./types";

// Scaled down from the plan table's literal seat ranges (free 1-3 ... enterprise 50-500)
// so the total across 1000 companies lands near the spec's target of 5000 users,
// while keeping the same relative skew across tiers.
const SEAT_RANGE: Record<PlanTier, [number, number]> = {
  free: [1, 3],
  starter: [2, 6],
  professional: [4, 12],
  enterprise: [8, 30],
};

const ROLES = ["Admin", "Analyst", "Manager", "Viewer"];

export function generateUsers(companies: CompanyRow[], seed: number, now: Date): UserRow[] {
  const rng = mulberry32(seed);
  const users: UserRow[] = [];
  let counter = 1;

  for (const company of companies) {
    const [minSeats, maxSeats] = SEAT_RANGE[company.planTier];
    const seatCount = randomInt(rng, minSeats, maxSeats);
    const signupDate = new Date(company.signupDate);

    for (let s = 0; s < seatCount; s++) {
      const id = `USR-${String(counter).padStart(5, "0")}`;
      const createdAt = randomDateBetween(rng, signupDate, now);
      const hasLoggedIn = rng() < 0.9;
      const firstLoginAt = hasLoggedIn ? randomDateBetween(rng, createdAt, now).toISOString() : null;
      const lastLoginAt =
        hasLoggedIn && firstLoginAt ? randomDateBetween(rng, new Date(firstLoginAt), now).toISOString() : null;
      const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, "");

      users.push({
        id,
        companyId: company.id,
        email: `user${counter}@${slug}.example`,
        role: ROLES[randomInt(rng, 0, ROLES.length - 1)],
        firstLoginAt,
        lastLoginAt,
        isActive: rng() < 0.85,
        createdAt: createdAt.toISOString(),
      });

      counter++;
    }
  }

  return users;
}
