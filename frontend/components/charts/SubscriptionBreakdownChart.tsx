"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SubscriptionBreakdownRow } from "@/lib/types";

const TIER_COLORS: Record<string, string> = {
  free: "var(--series-1)",
  starter: "var(--series-2)",
  professional: "var(--series-3)",
  enterprise: "var(--series-4)",
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

export function SubscriptionBreakdownChart({ data }: { data: SubscriptionBreakdownRow[] }) {
  const row: Record<string, number | string> = { name: "Customers" };
  for (const item of data) row[item.plan_tier] = item.count;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={[row]} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" hide />
        <Tooltip contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }} />
        <Legend formatter={(value: string) => TIER_LABELS[value] ?? value} />
        {data.map((item) => (
          <Bar
            key={item.plan_tier}
            dataKey={item.plan_tier}
            stackId="a"
            fill={TIER_COLORS[item.plan_tier]}
            name={item.plan_tier}
            radius={[4, 4, 4, 4]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
