import { mulberry32, pickWeighted, randomInt, randomDateBetween } from "./rng";
import type { CompanyRow, UserRow, HealthProfile, ProductEventRow, DeviceType } from "./types";

const EVENT_CATALOG: { name: string; weight: number; feature: string | null }[] = [
  { name: "user_login", weight: 25, feature: null },
  { name: "user_logout", weight: 20, feature: null },
  { name: "dashboard_viewed", weight: 15, feature: "dashboard" },
  { name: "analytics_viewed", weight: 10, feature: "analytics" },
  { name: "report_created", weight: 6, feature: "reports" },
  { name: "report_exported", weight: 4, feature: "reports" },
  { name: "data_uploaded", weight: 4, feature: "data_import" },
  { name: "integration_connected", weight: 2, feature: "integrations" },
  { name: "automation_created", weight: 2, feature: "automation" },
  { name: "workflow_created", weight: 2, feature: "workflows" },
  { name: "api_call", weight: 5, feature: "api" },
  { name: "team_member_invited", weight: 1, feature: "team" },
  { name: "billing_page_viewed", weight: 1, feature: "billing" },
  { name: "pricing_page_viewed", weight: 1, feature: "billing" },
  { name: "help_center_viewed", weight: 1.5, feature: "support" },
  { name: "support_requested", weight: 0.5, feature: "support" },
];

const DEVICE_TYPES: { value: DeviceType; weight: number }[] = [
  { value: "desktop", weight: 70 },
  { value: "mobile", weight: 25 },
  { value: "tablet", weight: 5 },
];

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function buildEvent(
  id: string,
  user: UserRow,
  activeSince: Date,
  now: Date,
  rng: () => number,
): ProductEventRow {
  const entry = pickWeighted(rng, EVENT_CATALOG.map((e) => ({ value: e, weight: e.weight })));
  return {
    id,
    userId: user.id,
    companyId: user.companyId,
    timestamp: randomDateBetween(rng, activeSince, now).toISOString(),
    eventName: entry.name,
    featureName: entry.feature,
    sessionDuration: randomInt(rng, 30, 1800),
    deviceType: pickWeighted(rng, DEVICE_TYPES),
  };
}

export function generateProductEvents(
  companies: CompanyRow[],
  users: UserRow[],
  healthProfiles: HealthProfile[],
  totalEvents: number,
  seed: number,
  now: Date,
): ProductEventRow[] {
  if (users.length === 0) {
    throw new Error("generateProductEvents requires a non-empty users array");
  }

  const rng = mulberry32(seed);
  const healthByCompany = new Map(healthProfiles.map((h) => [h.companyId, h]));
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 12);

  const weighted = users.map((user) => {
    const health = healthByCompany.get(user.companyId)!;
    const activeSince = new Date(Math.max(new Date(user.createdAt).getTime(), windowStart.getTime()));
    const activeMonths = Math.max(1, monthsBetween(activeSince, now));
    const monthlyRate = 0.5 + (health.healthFactor / 100) * 4.5;
    return { user, activeSince, weight: monthlyRate * activeMonths };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const events: ProductEventRow[] = [];
  let counter = 1;
  const nextId = () => `EVT-${String(counter++).padStart(6, "0")}`;

  for (const { user, activeSince, weight } of weighted) {
    const count = Math.round((weight / totalWeight) * totalEvents);
    for (let i = 0; i < count; i++) {
      events.push(buildEvent(nextId(), user, activeSince, now, rng));
    }
  }

  if (events.length > totalEvents) {
    events.length = totalEvents;
  } else {
    let i = 0;
    while (events.length < totalEvents && weighted.length > 0) {
      const { user, activeSince } = weighted[i % weighted.length];
      events.push(buildEvent(nextId(), user, activeSince, now, rng));
      i++;
    }
  }

  return events;
}
