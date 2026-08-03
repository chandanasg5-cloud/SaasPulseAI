"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MrrWaterfall } from "@/lib/types";

function formatGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

interface WaterfallStep {
  label: string;
  base: number;
  value: number;
  displayValue: number;
  kind: "total" | "good" | "critical";
}

function deltaStep(label: string, cumulativeBefore: number, delta: number): WaterfallStep {
  return {
    label,
    base: Math.min(cumulativeBefore, cumulativeBefore + delta),
    value: Math.abs(delta),
    displayValue: delta,
    kind: delta >= 0 ? "good" : "critical",
  };
}

function buildSteps(w: MrrWaterfall): WaterfallStep[] {
  const afterNew = w.starting_mrr + w.new_mrr;
  const afterExpansion = afterNew + w.expansion_mrr;
  const afterContraction = afterExpansion + w.contraction_mrr;

  return [
    { label: "Starting MRR", base: 0, value: w.starting_mrr, displayValue: w.starting_mrr, kind: "total" },
    deltaStep("New", w.starting_mrr, w.new_mrr),
    deltaStep("Expansion", afterNew, w.expansion_mrr),
    deltaStep("Contraction", afterExpansion, w.contraction_mrr),
    deltaStep("Churn", afterContraction, w.churned_mrr),
    { label: "Ending MRR", base: 0, value: w.ending_mrr, displayValue: w.ending_mrr, kind: "total" },
  ];
}

const KIND_COLOR: Record<WaterfallStep["kind"], string> = {
  total: "var(--chart-axis-muted)",
  good: "var(--status-good)",
  critical: "var(--status-critical)",
};

export function MrrWaterfallChart({ data }: { data: MrrWaterfall }) {
  const steps = buildSteps(data);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={steps} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="var(--chart-axis-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatGbp}
          width={64}
        />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const step = payload.find((p) => p.dataKey === "value")?.payload as WaterfallStep | undefined;
            if (!step) return null;
            return (
              <div
                style={{
                  background: "var(--chart-surface)",
                  color: "var(--chart-ink)",
                  border: "1px solid var(--chart-grid)",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <div style={{ fontWeight: 600 }}>{step.label}</div>
                <div>MRR change : {formatGbp(step.displayValue)}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 4, 4]}>
          {steps.map((step) => (
            <Cell key={step.label} fill={KIND_COLOR[step.kind]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
