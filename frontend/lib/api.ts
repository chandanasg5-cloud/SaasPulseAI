import type { CompaniesResponse, ExecutiveOverview, ProductOverview, CustomerHealthScoresResponse, SegmentsResponse, ChurnRiskResponse, ChurnRiskDistribution } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function getExecutiveOverview(): Promise<ExecutiveOverview> {
  const res = await fetch(`${API}/metrics/executive-overview`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /metrics/executive-overview failed: ${res.status}`);
  return res.json();
}

export async function getCompanies(pageSize = 25): Promise<CompaniesResponse> {
  const res = await fetch(`${API}/companies?pageSize=${pageSize}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /companies failed: ${res.status}`);
  return res.json();
}

export async function getProductOverview(): Promise<ProductOverview> {
  const res = await fetch(`${API}/metrics/product-overview`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /metrics/product-overview failed: ${res.status}`);
  return res.json();
}

export async function getCustomerHealthScores(page = 1, pageSize = 25, q?: string): Promise<CustomerHealthScoresResponse> {
  const search = q && q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
  const res = await fetch(`${API}/customers/health-scores?page=${page}&pageSize=${pageSize}${search}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/health-scores failed: ${res.status}`);
  return res.json();
}

export async function getCustomerSegments(): Promise<SegmentsResponse> {
  const res = await fetch(`${API}/customers/segments`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/segments failed: ${res.status}`);
  return res.json();
}

export async function getCustomerChurnRisk(page = 1, pageSize = 25, q?: string): Promise<ChurnRiskResponse> {
  const search = q && q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
  const res = await fetch(`${API}/customers/churn-risk?page=${page}&pageSize=${pageSize}${search}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/churn-risk failed: ${res.status}`);
  return res.json();
}

export async function getChurnRiskDistribution(): Promise<ChurnRiskDistribution> {
  const res = await fetch(`${API}/customers/churn-risk/distribution`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/churn-risk/distribution failed: ${res.status}`);
  return res.json();
}
