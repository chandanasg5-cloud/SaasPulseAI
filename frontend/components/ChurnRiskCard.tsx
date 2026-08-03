// frontend/components/ChurnRiskCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ChurnRiskCard as ChurnRiskCardData } from "@/lib/types";

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

export function ChurnRiskCard({ company }: { company: ChurnRiskCardData }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{company.company_name}</CardTitle>
        <Badge variant="outline" className="gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: RISK_DOT_VAR[company.risk_level] ?? "var(--chart-axis-muted)" }}
          />
          {RISK_LABELS[company.risk_level] ?? company.risk_level}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-4xl font-bold">
          {(company.churn_probability * 100).toFixed(0)}
          <span className="text-base font-medium text-muted-foreground">% churn probability</span>
        </div>
        <p className="text-base font-medium text-muted-foreground">
          {company.primary_risk_driver} · {company.secondary_risk_driver}
        </p>
        <p className="text-base font-medium text-muted-foreground">{company.recommendation}</p>
      </CardContent>
    </Card>
  );
}
