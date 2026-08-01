interface ExecutiveOverviewLike {
  kpis: {
    mrr: number; arr: number; revenue_growth_pct: number; customer_count: number;
    cac: number; clv: number; churn_rate_pct: number; nrr_pct: number;
  };
}

export function formatExecutiveOverview(data: ExecutiveOverviewLike): string {
  const k = data.kpis;
  return [
    `MRR: $${k.mrr.toFixed(2)}, ARR: $${k.arr.toFixed(2)}`,
    `Revenue growth: ${k.revenue_growth_pct.toFixed(1)}%`,
    `Active customers: ${k.customer_count}`,
    `CAC: $${k.cac.toFixed(2)}, CLV: $${k.clv.toFixed(2)}`,
    `Churn rate: ${k.churn_rate_pct.toFixed(1)}%, NRR: ${k.nrr_pct.toFixed(1)}%`,
  ].join("\n");
}

interface ProductOverviewLike {
  kpis: { dau: number; wau: number; mau: number; stickiness_pct: number; feature_adoption_pct: number };
  funnel: { stage: string; count: number }[];
}

export function formatProductOverview(data: ProductOverviewLike): string {
  const k = data.kpis;
  const funnelLine = data.funnel.map((f) => `${f.stage}: ${f.count}`).join(", ");
  return [
    `DAU: ${k.dau}, WAU: ${k.wau}, MAU: ${k.mau}`,
    `Stickiness: ${k.stickiness_pct.toFixed(1)}%, Feature adoption: ${k.feature_adoption_pct.toFixed(1)}%`,
    `Activation funnel: ${funnelLine}`,
  ].join("\n");
}

interface SegmentsLike {
  segments: {
    segment_label: string; company_count: number; pct_of_total: number;
    avg_usage_score: number; avg_adoption_score: number; avg_support_score: number;
    avg_revenue_score: number; avg_seat_penetration_score: number;
  }[];
}

export function formatCustomerSegments(data: SegmentsLike): string {
  return data.segments
    .map(
      (s) =>
        `${s.segment_label}: ${s.company_count} companies (${s.pct_of_total.toFixed(1)}%), ` +
        `avg scores usage=${s.avg_usage_score.toFixed(1)} adoption=${s.avg_adoption_score.toFixed(1)} ` +
        `support=${s.avg_support_score.toFixed(1)} revenue=${s.avg_revenue_score.toFixed(1)} ` +
        `seat_penetration=${s.avg_seat_penetration_score.toFixed(1)}`,
    )
    .join("\n");
}

interface ChurnRisksLike {
  companies: {
    company_name: string; churn_probability: number; risk_level: string;
    primary_risk_driver: string; secondary_risk_driver: string; recommendation: string;
  }[];
  total: number;
}

export function formatChurnRisks(data: ChurnRisksLike): string {
  if (data.companies.length === 0) return "No companies with churn predictions found.";
  const lines = data.companies.map(
    (c) =>
      `${c.company_name}: ${(c.churn_probability * 100).toFixed(0)}% churn probability (${c.risk_level} risk), ` +
      `drivers: ${c.primary_risk_driver}, ${c.secondary_risk_driver}. ${c.recommendation}`,
  );
  return `Top ${data.companies.length} highest-risk companies (of ${data.total} total):\n${lines.join("\n")}`;
}

interface CompanyProfileResultLike {
  found: boolean;
  company?: {
    name: string; industry: string; plan_tier: string;
    health: { overall_score: number; risk_level: string; recommended_action: string };
    segment_label: string | null;
    churn: {
      probability: number; risk_level: string;
      primary_risk_driver: string; secondary_risk_driver: string; recommendation: string;
    } | null;
  };
}

export function formatCompanyProfile(result: CompanyProfileResultLike): string {
  if (!result.found || !result.company) {
    return "No company found matching that name.";
  }
  const c = result.company;
  const lines = [
    `${c.name} (${c.industry}, ${c.plan_tier} plan)`,
    `Health score: ${c.health.overall_score}/100 (${c.health.risk_level} risk). ${c.health.recommended_action}`,
    `Segment: ${c.segment_label ?? "not available (company may be churned)"}`,
  ];
  if (c.churn) {
    lines.push(
      `Churn risk: ${(c.churn.probability * 100).toFixed(0)}% (${c.churn.risk_level}). ` +
        `Drivers: ${c.churn.primary_risk_driver}, ${c.churn.secondary_risk_driver}. ${c.churn.recommendation}`,
    );
  } else {
    lines.push("Churn risk: not available (company may be churned)");
  }
  return lines.join("\n");
}
