// frontend/components/CustomerCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CustomerHealthCard } from "@/lib/types";

const RISK_LABELS: Record<string, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

const RISK_DOT_VAR: Record<string, string> = {
  low: "var(--status-good)",
  medium: "var(--status-warning)",
  high: "var(--status-critical)",
};

export function CustomerCard({ customer }: { customer: CustomerHealthCard }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{customer.company_name}</CardTitle>
        <Badge variant="outline" className="gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: RISK_DOT_VAR[customer.risk_level] ?? "var(--chart-axis-muted)" }}
          />
          {RISK_LABELS[customer.risk_level] ?? customer.risk_level}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-semibold">
          {Math.round(customer.overall_score)}
          <span className="text-sm font-normal text-muted-foreground">/100</span>
        </div>
        <p className="text-sm text-muted-foreground">{customer.recommended_action}</p>
      </CardContent>
    </Card>
  );
}
