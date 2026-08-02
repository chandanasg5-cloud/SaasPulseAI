"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EngagementTrendPoint } from "@/lib/types";

const SERIES_LABELS: Record<string, string> = { dau: "DAU", wau: "WAU", mau: "MAU" };

export function EngagementTrendChart({ data }: { data: EngagementTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
        <Legend formatter={(value: string) => SERIES_LABELS[value] ?? value} />
        <Line type="monotone" dataKey="dau" name="dau" stroke="var(--series-1)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="wau" name="wau" stroke="var(--series-2)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="mau" name="mau" stroke="var(--series-3)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
