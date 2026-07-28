import { mulberry32, pickWeighted, randomInt, randomDateBetween } from "./rng";
import type { CompanyRow, HealthProfile, PlanTier } from "./types";

const INDUSTRIES = [
  "Software", "Financial Services", "Healthcare", "Retail", "Manufacturing",
  "Education", "Media", "Logistics", "Real Estate", "Professional Services",
];

const PLAN_TIERS: { value: PlanTier; weight: number }[] = [
  { value: "free", weight: 35 },
  { value: "starter", weight: 35 },
  { value: "professional", weight: 25 },
  { value: "enterprise", weight: 5 },
];

const COMPANY_SIZE_RANGE: Record<PlanTier, [number, number]> = {
  free: [5, 50],
  starter: [5, 50],
  professional: [50, 500],
  enterprise: [500, 5000],
};

export interface CompanyGenerationResult {
  companies: CompanyRow[];
  healthProfiles: HealthProfile[];
}

export function generateCompanies(count: number, seed: number, now: Date): CompanyGenerationResult {
  const rng = mulberry32(seed);
  const companies: CompanyRow[] = [];
  const healthProfiles: HealthProfile[] = [];

  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 18);

  for (let i = 1; i <= count; i++) {
    const id = `CMP-${String(i).padStart(4, "0")}`;
    const planTier = pickWeighted(rng, PLAN_TIERS);
    const [minSize, maxSize] = COMPANY_SIZE_RANGE[planTier];
    const signupDate = randomDateBetween(rng, windowStart, now);
    const industry = INDUSTRIES[randomInt(rng, 0, INDUSTRIES.length - 1)];
    const healthFactor = rng() * 100;
    const churnProbability = Math.min(0.7, Math.max(0.02, 0.02 + ((100 - healthFactor) / 100) * 0.6));

    companies.push({
      id,
      name: `${industry} Co ${i}`,
      industry,
      companySize: randomInt(rng, minSize, maxSize),
      planTier,
      // Finalized by generateSubscriptionsAndEvents (Task 5) once churn outcome is known.
      customerStage: "trial",
      signupDate: signupDate.toISOString().slice(0, 10),
    });

    healthProfiles.push({ companyId: id, healthFactor, churnProbability });
  }

  return { companies, healthProfiles };
}
