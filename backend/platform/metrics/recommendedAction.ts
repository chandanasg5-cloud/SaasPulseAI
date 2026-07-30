import type { HealthScore } from "./healthScore";

type SubScoreKey = "usage_score" | "adoption_score" | "support_score" | "revenue_score";

const SUBSCORE_ORDER: SubScoreKey[] = ["usage_score", "adoption_score", "support_score", "revenue_score"];

function findWeakest(score: HealthScore): SubScoreKey {
  let weakest = SUBSCORE_ORDER[0];
  for (const key of SUBSCORE_ORDER) {
    if (score[key] < score[weakest]) weakest = key;
  }
  return weakest;
}

function findStrongest(score: HealthScore): SubScoreKey {
  let strongest = SUBSCORE_ORDER[0];
  for (const key of SUBSCORE_ORDER) {
    if (score[key] > score[strongest]) strongest = key;
  }
  return strongest;
}

export function computeRecommendedAction(score: HealthScore): string {
  if (score.risk_level === "low") {
    return findStrongest(score) === "revenue_score"
      ? "Consider enterprise upgrade discussion"
      : "Healthy account — maintain regular touchpoints";
  }

  const weakest = findWeakest(score);
  const urgent = score.risk_level === "high";

  if (weakest === "adoption_score") {
    return urgent
      ? "Urgent: schedule an onboarding refresher — feature adoption is very low"
      : "Offer a feature adoption walkthrough to increase usage depth";
  }
  if (weakest === "usage_score") {
    return urgent
      ? "Urgent: re-engagement campaign needed — usage has dropped significantly"
      : "Re-engagement outreach recommended — usage has softened";
  }
  if (weakest === "support_score") {
    return urgent
      ? "Urgent: schedule a customer success check-in to resolve support issues"
      : "Review recent support history — proactively check in";
  }
  return urgent
    ? "Urgent: address payment/plan issues before renewal"
    : "Monitor for renewal risk given plan/payment status";
}
