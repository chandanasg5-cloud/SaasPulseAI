import { getCompanies, getExecutiveOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { CustomerGrowthChart } from "@/components/charts/CustomerGrowthChart";
import { MrrWaterfallChart } from "@/components/charts/MrrWaterfallChart";
import { SubscriptionBreakdownChart } from "@/components/charts/SubscriptionBreakdownChart";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function DashboardPage() {
  const [overview, companies] = await Promise.all([getExecutiveOverview(), getCompanies(25)]);
  const { kpis, charts } = overview;

  const kpiTiles = [
    { label: "MRR", value: formatCurrency(kpis.mrr) },
    { label: "ARR", value: formatCurrency(kpis.arr) },
    { label: "Revenue Growth", value: formatPercent(kpis.revenue_growth_pct) },
    { label: "Customer Count", value: kpis.customer_count.toLocaleString() },
    { label: "CAC", value: formatCurrency(kpis.cac) },
    { label: "CLV", value: formatCurrency(kpis.clv) },
    { label: "Churn Rate", value: formatPercent(kpis.churn_rate_pct) },
    { label: "NRR", value: formatPercent(kpis.nrr_pct) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Executive Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpiTiles.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{kpi.value}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={charts.revenue_trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerGrowthChart data={charts.customer_growth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MRR Waterfall (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <MrrWaterfallChart data={charts.mrr_waterfall} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <SubscriptionBreakdownChart data={charts.subscription_breakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Customer Stage</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.industry}</TableCell>
                  <TableCell className="capitalize">{c.plan_tier}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.customer_stage === "at_risk" || c.customer_stage === "churned"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {c.customer_stage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(c.mrr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
