"use client";

import { Cell, Pie, PieChart } from "recharts";

export function NrrDonutChart({ nrrPct }: { nrrPct: number }) {
  const filled = Math.max(0, Math.min(nrrPct, 100));
  const data = [
    { name: "retained", value: filled },
    { name: "rest", value: 100 - filled },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[200px] w-[200px]">
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius="70%"
            outerRadius="88%"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill="var(--series-1)" />
            <Cell fill="var(--chart-grid)" />
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold">{nrrPct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Full ring = 100%+ (net expansion)</p>
    </div>
  );
}
