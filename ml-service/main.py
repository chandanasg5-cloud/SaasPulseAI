import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

app = FastAPI(title="SaaSPulse AI ML Service")
logger = logging.getLogger("segmentation")

FEATURE_KEYS = ["usage_score", "adoption_score", "support_score", "revenue_score", "seat_penetration_score"]
RANDOM_SEED = 42
N_CLUSTERS = 4


class CompanyFeatures(BaseModel):
    company_id: str
    usage_score: float
    adoption_score: float
    support_score: float
    revenue_score: float
    seat_penetration_score: float


class ClusterRequest(BaseModel):
    companies: list[CompanyFeatures]


class Assignment(BaseModel):
    company_id: str
    cluster_id: int


class Centroid(BaseModel):
    cluster_id: int
    usage_score: float
    adoption_score: float
    support_score: float
    revenue_score: float
    seat_penetration_score: float


class ClusterMetadata(BaseModel):
    algorithm: str
    algorithm_version: str
    random_seed: int
    generated_at: str


class ClusterResponse(BaseModel):
    assignments: list[Assignment]
    centroids: list[Centroid]
    metadata: ClusterMetadata


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/cluster")
def cluster(request: ClusterRequest) -> ClusterResponse:
    companies = request.companies
    vectors = [[getattr(c, key) for key in FEATURE_KEYS] for c in companies]

    _log_silhouette_scores(vectors)

    model = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_SEED, n_init=10)
    labels = model.fit_predict(vectors)

    assignments = [
        Assignment(company_id=c.company_id, cluster_id=int(label))
        for c, label in zip(companies, labels)
    ]
    centroids = [
        Centroid(
            cluster_id=i,
            usage_score=float(center[0]),
            adoption_score=float(center[1]),
            support_score=float(center[2]),
            revenue_score=float(center[3]),
            seat_penetration_score=float(center[4]),
        )
        for i, center in enumerate(model.cluster_centers_)
    ]
    metadata = ClusterMetadata(
        algorithm="kmeans",
        algorithm_version="v1",
        random_seed=RANDOM_SEED,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    return ClusterResponse(assignments=assignments, centroids=centroids, metadata=metadata)


def _log_silhouette_scores(vectors: list[list[float]]) -> None:
    """Observability only: logs candidate-k silhouette scores. Never changes N_CLUSTERS,
    never exposed via the API — this project's persona set is a fixed product decision,
    not something recomputed per run."""
    for k in (3, 4, 5, 6):
        if len(vectors) <= k:
            continue
        candidate = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10)
        candidate_labels = candidate.fit_predict(vectors)
        score = silhouette_score(vectors, candidate_labels)
        logger.info("silhouette k=%d score=%.4f", k, score)
