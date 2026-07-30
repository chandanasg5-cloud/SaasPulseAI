export interface HealthScore {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  overall_score: number;
  risk_level: "low" | "medium" | "high";
}

export function computeHealthScore(
  usageScore: number,
  adoptionScore: number,
  supportScore: number,
  revenueScore: number,
): HealthScore {
  const overall = usageScore + adoptionScore + supportScore + revenueScore;
  const riskLevel: HealthScore["risk_level"] = overall >= 70 ? "low" : overall >= 40 ? "medium" : "high";

  return {
    usage_score: usageScore,
    adoption_score: adoptionScore,
    support_score: supportScore,
    revenue_score: revenueScore,
    overall_score: overall,
    risk_level: riskLevel,
  };
}
