import type { CompaniesResponse, MetricsOverview } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function getMetricsOverview(): Promise<MetricsOverview> {
  const res = await fetch(`${API}/metrics/overview`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /metrics/overview failed: ${res.status}`);
  return res.json();
}

export async function getCompanies(pageSize = 25): Promise<CompaniesResponse> {
  const res = await fetch(`${API}/companies?pageSize=${pageSize}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /companies failed: ${res.status}`);
  return res.json();
}
