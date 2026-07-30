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

  const signupUsers = users;
  const firstLoginUsers = signupUsers.filter((u) => u.first_login_at !== null);
  const firstFeatureUsageUsers = firstLoginUsers.filter((u) => (featuresByUser.get(u.id)?.size ?? 0) >= 1);
  const productAdoptionUsers = firstFeatureUsageUsers.filter((u) => (featuresByUser.get(u.id)?.size ?? 0) >= 3);
  const paidConversionUsers = productAdoptionUsers.filter((u) => paidCompanyIds.has(u.company_id));

  return [
    { stage: "signup", count: signupUsers.length },
    { stage: "first_login", count: firstLoginUsers.length },
    { stage: "first_feature_usage", count: firstFeatureUsageUsers.length },
    { stage: "product_adoption", count: productAdoptionUsers.length },
    { stage: "paid_conversion", count: paidConversionUsers.length },
  ];
}
