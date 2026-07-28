import { mulberry32, randomDateBetween } from "./rng";
import type {
  CompanyRow, HealthProfile, SubscriptionRow, SubscriptionEventRow, PlanTier, CustomerStage,
} from "./types";

const MRR_BY_PLAN: Record<PlanTier, number> = {
  free: 0,
  starter: 99,
  professional: 499,
  enterprise: 5000,
};

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function assignCustomerStage(
  healthFactor: number,
  monthsSinceSignup: number,
  isChurned: boolean,
): CustomerStage {
  if (isChurned) return "churned";
  if (monthsSinceSignup < 1) return "trial";
  if (monthsSinceSignup < 3) return "onboarding";
  if (healthFactor >= 80) return monthsSinceSignup >= 6 ? "power_user" : "growing";
  if (healthFactor < 40) return "at_risk";
  return "active";
}

export interface SubscriptionGenerationResult {
  companies: CompanyRow[];
  subscriptions: SubscriptionRow[];
  events: SubscriptionEventRow[];
}

export function generateSubscriptionsAndEvents(
  companies: CompanyRow[],
  healthProfiles: HealthProfile[],
  seed: number,
  now: Date,
): SubscriptionGenerationResult {
  const rng = mulberry32(seed);
  const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h]));
  const subscriptions: SubscriptionRow[] = [];
  const events: SubscriptionEventRow[] = [];
  const finalizedCompanies: CompanyRow[] = [];
  let subCounter = 1;
  let eventCounter = 1;
  const nextEventId = () => `SEV-${String(eventCounter++).padStart(6, "0")}`;

  for (const company of companies) {
    const health = healthByCompany.get(company.id)!;
    const signupDate = new Date(company.signupDate);
    const monthsSinceSignup = monthsBetween(signupDate, now);
    const baseMrr = MRR_BY_PLAN[company.planTier];

    events.push({
      id: nextEventId(),
      companyId: company.id,
      eventDate: company.signupDate,
      eventType: "new_subscription",
      previousPlan: null,
      newPlan: company.planTier,
      mrrChange: baseMrr,
    });

    const exposure = Math.min(1, monthsSinceSignup / 12);
    const isChurned = monthsSinceSignup >= 1 && rng() < health.churnProbability * exposure;

    let currentMrr = baseMrr;
    const currentPlan = company.planTier;
    let status: SubscriptionRow["status"] = monthsSinceSignup < 1 ? "trialing" : "active";
    let endDate: string | null = null;

    const midTenureFloor = new Date(signupDate);
    midTenureFloor.setDate(midTenureFloor.getDate() + 30);

    const canExpand =
      !isChurned && health.healthFactor >= 70 && monthsSinceSignup >= 3 && currentPlan !== "enterprise";
    const canContract = !isChurned && health.healthFactor < 40 && monthsSinceSignup >= 3;

    if (canExpand && rng() < 0.2) {
      const upgradeDate = randomDateBetween(rng, midTenureFloor, now);
      const newMrr = currentMrr * 1.5;
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: upgradeDate.toISOString().slice(0, 10),
        eventType: "upgrade",
        previousPlan: currentPlan,
        newPlan: currentPlan,
        mrrChange: newMrr - currentMrr,
      });
      currentMrr = newMrr;
    } else if (canContract && rng() < 0.2) {
      const downgradeDate = randomDateBetween(rng, midTenureFloor, now);
      const newMrr = currentMrr * 0.6;
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: downgradeDate.toISOString().slice(0, 10),
        eventType: "downgrade",
        previousPlan: currentPlan,
        newPlan: currentPlan,
        mrrChange: newMrr - currentMrr,
      });
      currentMrr = newMrr;
    }

    if (isChurned) {
      const cancelDate = randomDateBetween(rng, signupDate, now);
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: cancelDate.toISOString().slice(0, 10),
        eventType: "cancellation",
        previousPlan: currentPlan,
        newPlan: null,
        mrrChange: -currentMrr,
      });
      status = "canceled";
      endDate = cancelDate.toISOString().slice(0, 10);
    } else if (monthsSinceSignup >= 12) {
      const renewalDate = new Date(signupDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      events.push({
        id: nextEventId(),
        companyId: company.id,
        eventDate: renewalDate.toISOString().slice(0, 10),
        eventType: "renewal",
        previousPlan: currentPlan,
        newPlan: currentPlan,
        mrrChange: 0,
      });
      if (health.healthFactor < 30 && rng() < 0.1) status = "past_due";
    }

    subscriptions.push({
      id: `SUB-${String(subCounter++).padStart(4, "0")}`,
      companyId: company.id,
      planName: currentPlan,
      mrrAmount: currentMrr,
      billingCycle: rng() < 0.3 ? "annual" : "monthly",
      status,
      startDate: company.signupDate,
      endDate,
    });

    finalizedCompanies.push({
      ...company,
      customerStage: assignCustomerStage(health.healthFactor, monthsSinceSignup, isChurned),
    });
  }

  return { companies: finalizedCompanies, subscriptions, events };
}
