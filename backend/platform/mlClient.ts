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

export interface ChurnRequestCompany {
  company_id: string;
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
  tenure_days: number;
  recency_days: number;
  churned: boolean;
}

export interface ChurnPrediction {
  company_id: string;
  churn_probability: number;
}

export interface ChurnMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  roc_auc: number;
}

export interface ChurnFeatureImportances {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
  tenure_days: number;
  recency_days: number;
}

export interface ChurnModelMetadata {
  algorithm: string;
  algorithm_version: string;
  random_seed: number;
  generated_at: string;
  held_out_metrics: ChurnMetrics;
}

export interface ChurnPredictionResponse {
  predictions: ChurnPrediction[];
  feature_importances: ChurnFeatureImportances;
  metadata: ChurnModelMetadata;
}

export async function callChurnPredictionService(
  companies: ChurnRequestCompany[],
): Promise<ChurnPredictionResponse> {
  const res = await fetch(`${ML_SERVICE_URL}/predict-churn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
  });
  if (!res.ok) throw new Error(`POST ${ML_SERVICE_URL}/predict-churn failed: ${res.status}`);
  return res.json();
}
