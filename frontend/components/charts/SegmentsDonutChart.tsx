"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { SegmentSummary } from "@/lib/types";

const SEGMENT_COLORS: Record<string, string> = {
  "Power Users": "var(--series-1)",
  "Expansion Opportunity": "var(--series-2)",
  "High Value, Low Engagement": "var(--series-3)",
  "At Risk": "var(--series-4)",
};

export function SegmentsDonutChart({ segments }: { segments: SegmentSummary[] }) {
  const data = segments.map((s) => ({
    name: s.segment_label,
    value: s.company_count,
    pct: s.pct_of_total,
  }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
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
            <Cell key={d.name} fill={SEGMENT_COLORS[d.name] ?? "var(--series-1)"} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [`${value.toLocaleString()} companies`, name]}
          itemStyle={{ color: "var(--chart-ink)" }}
          wrapperStyle={{ zIndex: 10 }}
          contentStyle={{ background: "var(--chart-surface)", color: "var(--chart-ink)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
        />
      </PieChart>
      <ul className="min-w-44 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: SEGMENT_COLORS[d.name] ?? "var(--series-1)" }}
            />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="font-medium">{d.pct.toFixed(0)}%</span>
            <span className="text-muted-foreground">({d.value.toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
