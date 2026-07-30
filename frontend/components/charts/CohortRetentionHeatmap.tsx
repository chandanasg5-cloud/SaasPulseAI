// frontend/components/charts/CohortRetentionHeatmap.tsx
"use client";

import type { CohortRetentionCell } from "@/lib/types";

const SEQ_STEPS = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];

function colorForRetention(pct: number): string {
  const stepIndex = Math.min(SEQ_STEPS.length - 1, Math.floor((pct / 100) * SEQ_STEPS.length));
  return `var(${SEQ_STEPS[stepIndex]})`;
}

export function CohortRetentionHeatmap({ data }: { data: CohortRetentionCell[] }) {
  const cohortMonths = [...new Set(data.map((d) => d.cohort_month))].sort();
  const maxOffset = data.reduce((max, d) => Math.max(max, d.months_since_signup), 0);
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  const cellByKey = new Map(data.map((d) => [`${d.cohort_month}:${d.months_since_signup}`, d]));

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-muted-foreground">Cohort</th>
            {offsets.map((o) => (
              <th key={o} className="p-1 text-center font-normal text-muted-foreground">M{o}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohortMonths.map((month) => (
            <tr key={month}>
              <td className="whitespace-nowrap p-1 text-muted-foreground">{month}</td>
              {offsets.map((offset) => {
                const cell = cellByKey.get(`${month}:${offset}`);
                if (!cell) return <td key={offset} className="p-1" />;
                return (
                  <td
                    key={offset}
                    className="p-1 text-center"
                    style={{ background: colorForRetention(cell.retention_pct) }}
                    title={`${month}, month ${offset}: ${cell.retention_pct.toFixed(0)}% retained`}
                  >
                    {cell.retention_pct.toFixed(0)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
