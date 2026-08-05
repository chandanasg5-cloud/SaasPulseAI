import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: string;
  deltaPct?: number | null;
}

export function KpiCard({ label, value, deltaPct = null }: KpiCardProps) {
  const hasDelta = deltaPct !== null && Number.isFinite(deltaPct);
  const isZero = hasDelta && deltaPct === 0;
  const up = hasDelta && deltaPct > 0;
  const good = up;

  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {hasDelta && (
            <span
              className="inline-flex items-center gap-0.5 text-sm font-semibold"
              style={{
                color: isZero
                  ? "var(--chart-axis-muted)"
                  : good
                    ? "var(--status-good)"
                    : "var(--status-critical)",
              }}
            >
              {isZero ? null : up ? (
                <ArrowUpRight aria-label="up" className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight aria-label="down" className="h-3.5 w-3.5" />
              )}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          )}
        </div>
        {hasDelta && <p className="text-xs text-muted-foreground">vs last month</p>}
      </CardContent>
    </Card>
  );
}
