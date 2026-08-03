import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SegmentSummary } from "@/lib/types";

const SEGMENT_COLOR_VAR: Record<string, string> = {
  "Power Users": "var(--series-1)",
  "Expansion Opportunity": "var(--series-2)",
  "High Value, Low Engagement": "var(--series-3)",
  "At Risk": "var(--series-4)",
};

export function SegmentCard({ segment }: { segment: SegmentSummary }) {
  const color = SEGMENT_COLOR_VAR[segment.segment_label] ?? "var(--chart-axis-muted)";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <CardTitle className="text-base">{segment.segment_label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-4xl font-bold">{segment.company_count}</div>
          <p className="text-base font-medium text-muted-foreground">{segment.pct_of_total.toFixed(1)}% of customers</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-base">
          <dt className="font-medium text-muted-foreground">Usage</dt>
          <dd className="text-right font-semibold">{segment.avg_usage_score.toFixed(1)}</dd>
          <dt className="font-medium text-muted-foreground">Adoption</dt>
          <dd className="text-right font-semibold">{segment.avg_adoption_score.toFixed(1)}</dd>
          <dt className="font-medium text-muted-foreground">Support</dt>
          <dd className="text-right font-semibold">{segment.avg_support_score.toFixed(1)}</dd>
          <dt className="font-medium text-muted-foreground">Revenue</dt>
          <dd className="text-right font-semibold">{segment.avg_revenue_score.toFixed(1)}</dd>
          <dt className="font-medium text-muted-foreground">Seat Penetration</dt>
          <dd className="text-right font-semibold">{segment.avg_seat_penetration_score.toFixed(1)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
