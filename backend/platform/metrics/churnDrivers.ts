export interface ChurnFeatureVector {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
  tenure_days: number;
  recency_days: number;
}

export interface FeatureImportances {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
  tenure_days: number;
  recency_days: number;
}

type FeatureKey = keyof ChurnFeatureVector;

const FEATURE_ORDER: FeatureKey[] = [
  "usage_score", "adoption_score", "support_score", "revenue_score",
  "seat_penetration_score", "tenure_days", "recency_days",
];

/** recency_days is the one feature where ABOVE average increases risk; all others are BELOW average. */
const INVERTED_FEATURES = new Set<FeatureKey>(["recency_days"]);

const DRIVER_LABELS: Record<FeatureKey, string> = {
  usage_score: "Low Product Usage",
  adoption_score: "Weak Feature Adoption",
  support_score: "Elevated Support Activity",
  revenue_score: "Low Plan Value",
  seat_penetration_score: "Low Organizational Adoption",
  tenure_days: "Short Tenure",
  recency_days: "Inactive Recently",
};

export interface ChurnDrivers {
  primary_risk_driver: string;
  secondary_risk_driver: string;
}

export function computeChurnDrivers(
  companyFeatures: ChurnFeatureVector,
  populationAverages: ChurnFeatureVector,
  importances: FeatureImportances,
): ChurnDrivers {
  const contributions = FEATURE_ORDER.map((key) => {
    const raw = INVERTED_FEATURES.has(key)
      ? companyFeatures[key] - populationAverages[key]
      : populationAverages[key] - companyFeatures[key];
    return { key, contribution: raw * importances[key] };
  });

  contributions.sort((a, b) => {
    if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    return FEATURE_ORDER.indexOf(a.key) - FEATURE_ORDER.indexOf(b.key);
  });

  return {
    primary_risk_driver: DRIVER_LABELS[contributions[0].key],
    secondary_risk_driver: DRIVER_LABELS[contributions[1].key],
  };
}
