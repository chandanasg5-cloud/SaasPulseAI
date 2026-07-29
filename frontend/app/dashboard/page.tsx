import { getCompanies, getMetricsOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DashboardPage() {
  const [metrics, companies] = await Promise.all([getMetricsOverview(), getCompanies(25)]);

  const kpis = [
    { label: "Total Companies", value: metrics.total_companies.toLocaleString() },
    { label: "Total Users", value: metrics.total_users.toLocaleString() },
    { label: "Product Events", value: metrics.total_events.toLocaleString() },
    { label: "Current MRR", value: formatCurrency(metrics.current_mrr) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Executive Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{kpi.value}</CardContent>
          </Card>
        ))}
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
