"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { ChurnRiskDistribution } from "@/lib/types";

const LEVELS = [
  { key: "high", label: "High Risk", color: "var(--status-critical)" },
  { key: "medium", label: "Medium Risk", color: "var(--status-warning)" },
  { key: "low", label: "Low Risk", color: "var(--status-good)" },
] as const;

export function ChurnRiskDonutChart({ distribution }: { distribution: ChurnRiskDistribution }) {
  const data = LEVELS.map((l) => ({ name: l.label, value: distribution[l.key], color: l.color }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative h-[200px] w-[200px]">
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            stroke="var(--chart-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toLocaleString()} customers`, name]}
            contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
          />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{distribution.total.toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
      <ul className="min-w-44 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-medium">
              {distribution.total === 0 ? "0" : ((d.value / distribution.total) * 100).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">({d.value.toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
