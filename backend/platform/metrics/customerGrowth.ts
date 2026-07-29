import type { CompanyRow, SubscriptionRow } from "./types";
import { endOfMonth, monthKey, parseLocalDate, trailingMonths } from "./months";

export interface CustomerGrowthPoint {
  month: string;
  active_customers: number;
}

export function computeCustomerGrowth(
  companies: CompanyRow[],
  subscriptions: SubscriptionRow[],
  now: Date,
  monthCount = 12,
): CustomerGrowthPoint[] {
  const subByCompany = new Map(subscriptions.map((s) => [s.company_id, s]));
  const months = trailingMonths(now, monthCount);

  return months.map((monthStart) => {
    const cutoff = endOfMonth(monthStart);
    const activeCount = companies.filter((c) => {
      if (parseLocalDate(c.signup_date) > cutoff) return false;
      const sub = subByCompany.get(c.id);
      if (!sub) return false;
      if (sub.status !== "canceled") return true;
      return sub.end_date !== null && parseLocalDate(sub.end_date) > cutoff;
    }).length;
    return { month: monthKey(monthStart), active_customers: activeCount };
  });
}
