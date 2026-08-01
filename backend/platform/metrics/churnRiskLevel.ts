export type ChurnRiskLevel = "low" | "medium" | "high";

export function computeChurnRiskLevel(probability: number): ChurnRiskLevel {
  if (probability >= 0.5) return "high";
  if (probability >= 0.2) return "medium";
  return "low";
}
