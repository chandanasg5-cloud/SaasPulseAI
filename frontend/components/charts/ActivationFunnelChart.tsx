// frontend/components/charts/ActivationFunnelChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FunnelStage } from "@/lib/types";

const STAGE_LABELS: Record<string, string> = {
  signup: "Signup",
  first_login: "First Login",
  first_feature_usage: "First Feature Usage",
  product_adoption: "Product Adoption",
  paid_conversion: "Paid Conversion",
};

export function ActivationFunnelChart({ data }: { data: FunnelStage[] }) {
  const chartData = data.map((d) => ({ ...d, label: STAGE_LABELS[d.stage] ?? d.stage }));

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
          formatter={(value: number) => [value.toLocaleString(), "Users"]}
          contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Bar dataKey="count" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
