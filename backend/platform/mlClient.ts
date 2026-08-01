export interface ClusterRequestCompany {
  company_id: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

export interface ClusterAssignment {
  company_id: string;
  cluster_id: number;
}

export interface ClusterCentroid {
  cluster_id: number;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
}

export interface ClusterMetadata {
  algorithm: string;
  algorithm_version: string;
  random_seed: number;
  generated_at: string;
}

export interface ClusterResponse {
  assignments: ClusterAssignment[];
  centroids: ClusterCentroid[];
  metadata: ClusterMetadata;
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8001";

export async function callClusterService(companies: ClusterRequestCompany[]): Promise<ClusterResponse> {
  const res = await fetch(`${ML_SERVICE_URL}/cluster`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
  });
  if (!res.ok) throw new Error(`POST ${ML_SERVICE_URL}/cluster failed: ${res.status}`);
  return res.json();
}
