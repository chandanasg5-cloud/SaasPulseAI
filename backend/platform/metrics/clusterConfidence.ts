export interface CentroidWithId {
  cluster_id: number;
  vector: number[];
}

export interface DistanceAndConfidence {
  distance_to_centroid: number;
  cluster_confidence: number;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
}

/**
 * cluster_confidence is a margin-based score: how much closer the company is to its own
 * centroid than to the nearest other centroid, normalized to [0, 1]. A company sitting on
 * its centroid with the next-nearest cluster far away scores near 1; a company nearly
 * equidistant between two clusters (an ambiguous assignment) scores near 0.
 */
export function computeDistanceAndConfidence(
  companyVector: number[],
  ownClusterId: number,
  allCentroids: CentroidWithId[],
): DistanceAndConfidence {
  const own = allCentroids.find((c) => c.cluster_id === ownClusterId);
  if (!own) throw new Error(`No centroid found for cluster_id ${ownClusterId}`);
  const distanceToOwn = euclideanDistance(companyVector, own.vector);

  let distanceToSecondNearest = Infinity;
  for (const centroid of allCentroids) {
    if (centroid.cluster_id === ownClusterId) continue;
    const d = euclideanDistance(companyVector, centroid.vector);
    if (d < distanceToSecondNearest) distanceToSecondNearest = d;
  }

  const confidence =
    distanceToSecondNearest === 0
      ? 0
      : Math.max(0, Math.min(1, (distanceToSecondNearest - distanceToOwn) / distanceToSecondNearest));

  return { distance_to_centroid: distanceToOwn, cluster_confidence: confidence };
}
