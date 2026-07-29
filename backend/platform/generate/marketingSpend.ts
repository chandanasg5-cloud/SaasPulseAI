import { mulberry32 } from "./rng";

export interface MarketingSpendRow {
  id: string;
  month: string;
  amount: number;
}

export function generateMarketingSpend(
  newPayingCustomersByMonth: { month: string; count: number }[],
  seed: number,
): MarketingSpendRow[] {
  const rng = mulberry32(seed);

  return newPayingCustomersByMonth.map(({ month, count }, i) => {
    const perCustomerCac = 150 + rng() * 250; // £150–£400 plausible CAC band
    const amount = Math.round(count * perCustomerCac * 100) / 100;
    return {
      id: `MKT-${String(i + 1).padStart(4, "0")}`,
      month,
      amount,
    };
  });
}
