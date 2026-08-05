import type { CustomerGrowthPoint, RevenueTrendPoint } from "./types";

export interface KpiDeltas {
  mrrPct: number | null;
  arrPct: number | null;
  customersPct: number | null;
}

function pctChange(prev: number | undefined, last: number | undefined): number | null {
  if (prev === undefined || last === undefined || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

export function computeKpiDeltas(
  revenueTrend: RevenueTrendPoint[],
  customerGrowth: CustomerGrowthPoint[],
): KpiDeltas {
  const mrrPct = pctChange(revenueTrend.at(-2)?.mrr, revenueTrend.at(-1)?.mrr);
  const customersPct = pctChange(
    customerGrowth.at(-2)?.active_customers,
    customerGrowth.at(-1)?.active_customers,
  );
  // ARR = MRR × 12, so its month-over-month percent change is identical.
  return { mrrPct, arrPct: mrrPct, customersPct };
}
