// backend/platform/metrics/segmentDrivers.ts
export interface ScoreVector {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

type ScoreKey = keyof ScoreVector;

const DRIVER_ORDER: ScoreKey[] = [
  "usage_score", "adoption_score", "support_score", "revenue_score", "seat_penetration_score",
];

const DRIVER_LABELS: Record<ScoreKey, string> = {
  usage_score: "High Product Usage",
  adoption_score: "Strong Feature Adoption",
  support_score: "Low Support Burden",
  revenue_score: "High Plan Value",
  seat_penetration_score: "Deep Organizational Adoption",
};

export interface SegmentDrivers {
  primary_driver: string;
  secondary_driver: string;
}

export function computeSegmentDrivers(companyScores: ScoreVector, populationAverages: ScoreVector): SegmentDrivers {
  const deviations = DRIVER_ORDER.map((key) => ({
    key,
    deviation: companyScores[key] - populationAverages[key],
  }));

  deviations.sort((a, b) => {
    if (b.deviation !== a.deviation) return b.deviation - a.deviation;
    return DRIVER_ORDER.indexOf(a.key) - DRIVER_ORDER.indexOf(b.key);
  });

  return {
    primary_driver: DRIVER_LABELS[deviations[0].key],
    secondary_driver: DRIVER_LABELS[deviations[1].key],
  };
}
