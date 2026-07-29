import type { ProductEventRow, UserRow } from "./types";

export interface FunnelStage {
  stage: "signup" | "first_login" | "first_feature_usage" | "product_adoption" | "paid_conversion";
  count: number;
}

export function computeActivationFunnel(
  users: UserRow[],
  events: ProductEventRow[],
  paidCompanyIds: Set<string>,
): FunnelStage[] {
  const featuresByUser = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.feature_name) continue;
    const set = featuresByUser.get(e.user_id) ?? new Set<string>();
    set.add(e.feature_name);
    featuresByUser.set(e.user_id, set);
  }

  const signup = users.length;
  const firstLogin = users.filter((u) => u.first_login_at !== null).length;
  const firstFeatureUsage = users.filter((u) => (featuresByUser.get(u.id)?.size ?? 0) >= 1).length;
  const productAdoption = users.filter((u) => (featuresByUser.get(u.id)?.size ?? 0) >= 3).length;
  const paidConversion = users.filter((u) => paidCompanyIds.has(u.company_id)).length;

  return [
    { stage: "signup", count: signup },
    { stage: "first_login", count: firstLogin },
    { stage: "first_feature_usage", count: firstFeatureUsage },
    { stage: "product_adoption", count: productAdoption },
    { stage: "paid_conversion", count: paidConversion },
  ];
}
