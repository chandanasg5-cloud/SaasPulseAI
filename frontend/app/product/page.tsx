// frontend/app/product/page.tsx
import { getProductOverview } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureUsageRankingChart } from "@/components/charts/FeatureUsageRankingChart";
import { ActivationFunnelChart } from "@/components/charts/ActivationFunnelChart";
import { EngagementTrendChart } from "@/components/charts/EngagementTrendChart";
import { CohortRetentionHeatmap } from "@/components/charts/CohortRetentionHeatmap";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function ProductPage() {
  const overview = await getProductOverview();
  const { kpis, funnel, charts } = overview;

  const kpiTiles = [
    { label: "DAU", value: kpis.dau.toLocaleString() },
    { label: "WAU", value: kpis.wau.toLocaleString() },
    { label: "MAU", value: kpis.mau.toLocaleString() },
    { label: "Stickiness", value: formatPercent(kpis.stickiness_pct) },
    { label: "Feature Adoption", value: formatPercent(kpis.feature_adoption_pct) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">SaaSPulse AI — Product Analytics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {kpiTiles.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{kpi.value}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activation Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivationFunnelChart data={funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature Usage Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureUsageRankingChart data={charts.feature_usage_ranking} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engagement Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <EngagementTrendChart data={charts.engagement_trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cohort Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <CohortRetentionHeatmap data={charts.cohort_retention} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
