import { getChurnRiskDistribution, getCustomerSegments, getExecutiveOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import { AskAnalystBar } from "@/components/AskAnalystBar";
import { computeKpiDeltas } from "@/lib/kpiDeltas";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { CustomerGrowthChart } from "@/components/charts/CustomerGrowthChart";
import { MrrWaterfallChart } from "@/components/charts/MrrWaterfallChart";
import { SubscriptionBreakdownChart } from "@/components/charts/SubscriptionBreakdownChart";
import { NrrDonutChart } from "@/components/charts/NrrDonutChart";
import { SegmentsDonutChart } from "@/components/charts/SegmentsDonutChart";
import { ChurnRiskDonutChart } from "@/components/charts/ChurnRiskDonutChart";

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
  const [overview, segmentsRes, churnDist] = await Promise.all([
    getExecutiveOverview(),
    getCustomerSegments(),
    getChurnRiskDistribution(),
  ]);
  const { kpis, charts } = overview;
  const deltas = computeKpiDeltas(charts.revenue_trend, charts.customer_growth);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Executive Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="MRR" value={formatCurrency(kpis.mrr)} deltaPct={deltas.mrrPct} />
        <KpiCard label="ARR" value={formatCurrency(kpis.arr)} deltaPct={deltas.arrPct} />
        <KpiCard label="Customers" value={kpis.customer_count.toLocaleString()} deltaPct={deltas.customersPct} />
        <KpiCard label="Churn Rate" value={formatPercent(kpis.churn_rate_pct)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>MRR Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={charts.revenue_trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net Revenue Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <NrrDonutChart nrrPct={kpis.nrr_pct} />
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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer Segments</CardTitle>
            <p className="text-sm text-muted-foreground">
              {segmentsRes.segments.length} active segments
            </p>
          </CardHeader>
          <CardContent>
            <SegmentsDonutChart segments={segmentsRes.segments} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Churn Risk Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">All customers</p>
          </CardHeader>
          <CardContent>
            <ChurnRiskDonutChart distribution={churnDist} />
          </CardContent>
        </Card>
      </div>

      <AskAnalystBar />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">More metrics</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Revenue Growth" value={formatPercent(kpis.revenue_growth_pct)} />
          <KpiCard label="CAC" value={formatCurrency(kpis.cac)} />
          <KpiCard label="CLV" value={formatCurrency(kpis.clv)} />
          <KpiCard label="NRR" value={formatPercent(kpis.nrr_pct)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>MRR Waterfall (Last 30 Days)</CardTitle>
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
      </section>
    </main>
  );
}
