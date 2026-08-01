import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from xgboost import XGBClassifier

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


CHURN_FEATURE_KEYS = [
    "usage_score", "adoption_score", "support_score", "revenue_score",
    "seat_penetration_score", "tenure_days", "recency_days",
]


class ChurnCompanyFeatures(BaseModel):
    company_id: str
    usage_score: float
    adoption_score: float
    support_score: float
    revenue_score: float
    seat_penetration_score: float
    tenure_days: float
    recency_days: float
    churned: bool


class ChurnPredictionRequest(BaseModel):
    companies: list[ChurnCompanyFeatures]


class ChurnPrediction(BaseModel):
    company_id: str
    churn_probability: float


class ChurnMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    roc_auc: float


class ChurnFeatureImportances(BaseModel):
    usage_score: float
    adoption_score: float
    support_score: float
    revenue_score: float
    seat_penetration_score: float
    tenure_days: float
    recency_days: float


class ChurnModelMetadata(BaseModel):
    algorithm: str
    algorithm_version: str
    random_seed: int
    generated_at: str
    held_out_metrics: ChurnMetrics


class ChurnPredictionResponse(BaseModel):
    predictions: list[ChurnPrediction]
    feature_importances: ChurnFeatureImportances
    metadata: ChurnModelMetadata


@app.post("/predict-churn")
def predict_churn(request: ChurnPredictionRequest) -> ChurnPredictionResponse:
    companies = request.companies
    X = [[getattr(c, key) for key in CHURN_FEATURE_KEYS] for c in companies]
    y = [1 if c.churned else 0 for c in companies]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y,
    )

    eval_model = XGBClassifier(
        n_estimators=100, max_depth=4, random_state=RANDOM_SEED, eval_metric="logloss",
    )
    eval_model.fit(X_train, y_train)
    y_pred = eval_model.predict(X_test)
    y_proba = eval_model.predict_proba(X_test)[:, 1]

    metrics = ChurnMetrics(
        accuracy=float(accuracy_score(y_test, y_pred)),
        precision=float(precision_score(y_test, y_pred, zero_division=0)),
        recall=float(recall_score(y_test, y_pred, zero_division=0)),
        roc_auc=float(roc_auc_score(y_test, y_proba)),
    )

    final_model = XGBClassifier(
        n_estimators=100, max_depth=4, random_state=RANDOM_SEED, eval_metric="logloss",
    )
    final_model.fit(X, y)

    probabilities = final_model.predict_proba(X)[:, 1]
    predictions = [
        ChurnPrediction(company_id=c.company_id, churn_probability=float(p))
        for c, p in zip(companies, probabilities)
    ]

    raw_importances = final_model.feature_importances_
    feature_importances = ChurnFeatureImportances(
        **{key: float(raw_importances[i]) for i, key in enumerate(CHURN_FEATURE_KEYS)}
    )

    metadata = ChurnModelMetadata(
        algorithm="xgboost",
        algorithm_version="v1",
        random_seed=RANDOM_SEED,
        generated_at=datetime.now(timezone.utc).isoformat(),
        held_out_metrics=metrics,
    )

    return ChurnPredictionResponse(
        predictions=predictions,
        feature_importances=feature_importances,
        metadata=metadata,
    )
