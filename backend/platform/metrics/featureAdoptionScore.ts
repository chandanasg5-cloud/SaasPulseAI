import type { ProductEventRow } from "./types";
import { computeFeatureAdoptionRate } from "./featureAdoptionRate";

export function computeFeatureAdoptionScore(events: ProductEventRow[], now: Date): number {
  return computeFeatureAdoptionRate(events, now) / 4;
}
