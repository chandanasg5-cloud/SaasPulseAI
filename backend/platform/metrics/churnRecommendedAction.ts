import type { ChurnRiskLevel } from "./churnRiskLevel";

const MEDIUM_ACTIONS: Record<string, string> = {
  "Low Product Usage": "Re-engagement outreach recommended — usage has softened",
  "Weak Feature Adoption": "Offer a feature adoption walkthrough to increase usage depth",
  "Elevated Support Activity": "Review recent support history — proactively check in",
  "Low Plan Value": "Monitor for renewal risk given plan/payment status",
  "Low Organizational Adoption": "Encourage broader team rollout to increase seat usage",
  "Short Tenure": "New account — schedule an onboarding check-in to reinforce early value",
  "Inactive Recently": "Reach out — no recent product activity detected",
};

const HIGH_ACTIONS: Record<string, string> = {
  "Low Product Usage": "Urgent: re-engagement campaign needed — usage has dropped significantly",
  "Weak Feature Adoption": "Urgent: schedule an onboarding refresher — feature adoption is very low",
  "Elevated Support Activity": "Urgent: schedule a customer success check-in to resolve support issues",
  "Low Plan Value": "Urgent: address payment/plan issues before renewal",
  "Low Organizational Adoption": "Urgent: escalate to customer success — seat utilization is critically low",
  "Short Tenure": "Urgent: high churn risk during onboarding — assign a dedicated success contact",
  "Inactive Recently": "Urgent: immediate outreach required — account has gone dark",
};

export function computeChurnRecommendedAction(
  riskLevel: ChurnRiskLevel,
  primaryRiskDriver: string,
): string {
  if (riskLevel === "low") {
    return "Healthy account — low churn risk, maintain regular touchpoints";
  }
  const table = riskLevel === "high" ? HIGH_ACTIONS : MEDIUM_ACTIONS;
  return (
    table[primaryRiskDriver] ??
    (riskLevel === "high"
      ? "Urgent: review account health — elevated churn risk detected"
      : "Review account health — churn risk is elevated")
  );
}
