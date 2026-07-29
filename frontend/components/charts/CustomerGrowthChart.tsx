"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CustomerGrowthPoint } from "@/lib/types";

export function CustomerGrowthChart({ data }: { data: CustomerGrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          formatter={(value: number) => [value.toLocaleString(), "Active customers"]}
          contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="active_customers" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
