// frontend/components/charts/FeatureUsageRankingChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FeatureUsageRow } from "@/lib/types";

// Keys are `feature_name` values (from backend/platform/generate/events.ts's
// EVENT_CATALOG), not `event_name` values — several event names share one
// feature (report_created/report_exported -> "reports", etc.).
const FEATURE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  reports: "Reports",
  data_import: "Data Import",
  integrations: "Integrations",
  automation: "Automation",
  workflows: "Workflows",
  api: "API",
  team: "Team",
  billing: "Billing",
  support: "Support",
};

function humanizeFeature(name: string): string {
  return FEATURE_LABELS[name] ?? name;
}

export function FeatureUsageRankingChart({ data }: { data: FeatureUsageRow[] }) {
  const chartData = data.map((d) => ({ ...d, label: humanizeFeature(d.feature_name) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke="var(--chart-axis-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip
          formatter={(value: number) => [value.toLocaleString(), "Events"]}
          contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Bar dataKey="event_count" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
