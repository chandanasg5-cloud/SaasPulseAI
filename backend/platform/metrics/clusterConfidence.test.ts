import { describe, it, expect } from "vitest";
import { computeDistanceAndConfidence, type CentroidWithId } from "./clusterConfidence";

describe("computeDistanceAndConfidence", () => {
  const centroids: CentroidWithId[] = [
    { cluster_id: 0, vector: [0, 0, 0, 0, 0] },
    { cluster_id: 1, vector: [10, 10, 10, 10, 10] },
  ];

  it("returns distance 0 and confidence 1 when the company sits exactly on its own centroid", () => {
    const result = computeDistanceAndConfidence([0, 0, 0, 0, 0], 0, centroids);
    expect(result.distance_to_centroid).toBe(0);
    expect(result.cluster_confidence).toBe(1);
  });

  it("returns confidence near 0 when equidistant between own and second-nearest centroid", () => {
    const midpoint = [5, 5, 5, 5, 5];
    const result = computeDistanceAndConfidence(midpoint, 0, centroids);
    expect(result.cluster_confidence).toBeCloseTo(0, 5);
  });

  it("computes Euclidean distance correctly", () => {
    const result = computeDistanceAndConfidence([3, 4, 0, 0, 0], 0, centroids);
    // sqrt(3^2 + 4^2) = 5
    expect(result.distance_to_centroid).toBeCloseTo(5, 5);
  });

  it("clamps confidence to 0 when the second-nearest centroid distance is 0 (degenerate case)", () => {
    const degenerate: CentroidWithId[] = [
      { cluster_id: 0, vector: [0, 0, 0, 0, 0] },
      { cluster_id: 1, vector: [5, 0, 0, 0, 0] },
    ];
    const result = computeDistanceAndConfidence([5, 0, 0, 0, 0], 0, degenerate);
    expect(result.cluster_confidence).toBe(0);
  });
});
