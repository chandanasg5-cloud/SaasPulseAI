export interface SegmentCentroid {
  cluster_id: number;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

function overallScore(c: SegmentCentroid): number {
  return c.usage_score + c.adoption_score + c.support_score + c.revenue_score + c.seat_penetration_score;
}

function revenueEngagementGap(c: SegmentCentroid): number {
  return c.revenue_score - (c.usage_score + c.adoption_score + c.seat_penetration_score) / 3;
}

/** Assumes exactly 4 centroids, matching this project's fixed k=4 production configuration. */
export function computeSegmentLabels(centroids: SegmentCentroid[]): Map<number, string> {
  const sorted = [...centroids].sort((a, b) => overallScore(b) - overallScore(a));
  const [powerUsers, midA, midB, atRisk] = sorted;

  const labels = new Map<number, string>();
  labels.set(powerUsers.cluster_id, "Power Users");
  labels.set(atRisk.cluster_id, "At Risk");

  const gapA = revenueEngagementGap(midA);
  const gapB = revenueEngagementGap(midB);
  const highValue =
    gapA > gapB ? midA : gapB > gapA ? midB : midA.revenue_score >= midB.revenue_score ? midA : midB;
  const expansion = highValue === midA ? midB : midA;

  labels.set(highValue.cluster_id, "High Value, Low Engagement");
  labels.set(expansion.cluster_id, "Expansion Opportunity");

  return labels;
}
