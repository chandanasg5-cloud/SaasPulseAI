from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def _company(company_id, usage, adoption, support, revenue, seat):
    return {
        "company_id": company_id,
        "usage_score": usage,
        "adoption_score": adoption,
        "support_score": support,
        "revenue_score": revenue,
        "seat_penetration_score": seat,
    }


FIXTURE_COMPANIES = [
    _company("CMP-A1", 24, 23, 20, 22, 23),
    _company("CMP-A2", 23, 22, 19, 23, 22),
    _company("CMP-B1", 4, 3, 22, 5, 4),
    _company("CMP-B2", 3, 4, 21, 4, 3),
    _company("CMP-C1", 22, 20, 15, 6, 21),
    _company("CMP-C2", 21, 21, 14, 5, 20),
    _company("CMP-D1", 5, 4, 12, 24, 5),
    _company("CMP-D2", 4, 5, 13, 23, 4),
]


def test_cluster_returns_four_clusters_with_full_assignment():
    response = client.post("/cluster", json={"companies": FIXTURE_COMPANIES})
    assert response.status_code == 200
    body = response.json()

    assert len(body["centroids"]) == 4
    assignment_ids = {a["company_id"] for a in body["assignments"]}
    assert assignment_ids == {c["company_id"] for c in FIXTURE_COMPANIES}
    assert len(body["assignments"]) == len(FIXTURE_COMPANIES)

    cluster_ids_used = {a["cluster_id"] for a in body["assignments"]}
    assert cluster_ids_used == {0, 1, 2, 3}


def test_cluster_metadata():
    response = client.post("/cluster", json={"companies": FIXTURE_COMPANIES})
    metadata = response.json()["metadata"]
    assert metadata["algorithm"] == "kmeans"
    assert metadata["random_seed"] == 42
    assert metadata["algorithm_version"]
    assert metadata["generated_at"]


def test_cluster_is_deterministic_across_calls():
    first = client.post("/cluster", json={"companies": FIXTURE_COMPANIES}).json()
    second = client.post("/cluster", json={"companies": FIXTURE_COMPANIES}).json()

    first_map = {a["company_id"]: a["cluster_id"] for a in first["assignments"]}
    second_map = {a["company_id"]: a["cluster_id"] for a in second["assignments"]}
    assert first_map == second_map


import random


def _make_churn_fixture():
    rng = random.Random(123)
    companies = []
    for i in range(30):
        companies.append({
            "company_id": f"HLTH-{i}",
            "usage_score": rng.uniform(18, 25),
            "adoption_score": rng.uniform(18, 25),
            "support_score": rng.uniform(18, 25),
            "revenue_score": rng.uniform(12, 25),
            "seat_penetration_score": rng.uniform(18, 25),
            "tenure_days": rng.uniform(200, 800),
            "recency_days": rng.uniform(0, 5),
            "churned": False,
        })
    for i in range(10):
        companies.append({
            "company_id": f"RISK-{i}",
            "usage_score": rng.uniform(0, 8),
            "adoption_score": rng.uniform(0, 8),
            "support_score": rng.uniform(5, 15),
            "revenue_score": rng.uniform(0, 12),
            "seat_penetration_score": rng.uniform(0, 8),
            "tenure_days": rng.uniform(10, 100),
            "recency_days": rng.uniform(30, 90),
            "churned": True,
        })
    return companies


CHURN_FIXTURE = _make_churn_fixture()


def test_predict_churn_returns_probability_for_every_company():
    response = client.post("/predict-churn", json={"companies": CHURN_FIXTURE})
    assert response.status_code == 200
    body = response.json()

    assert len(body["predictions"]) == len(CHURN_FIXTURE)
    predicted_ids = {p["company_id"] for p in body["predictions"]}
    assert predicted_ids == {c["company_id"] for c in CHURN_FIXTURE}
    for p in body["predictions"]:
        assert 0.0 <= p["churn_probability"] <= 1.0


def test_predict_churn_held_out_metrics_in_range():
    response = client.post("/predict-churn", json={"companies": CHURN_FIXTURE})
    metrics = response.json()["metadata"]["held_out_metrics"]
    for key in ("accuracy", "precision", "recall", "roc_auc"):
        assert 0.0 <= metrics[key] <= 1.0


def test_predict_churn_feature_importances_sum_to_about_one():
    response = client.post("/predict-churn", json={"companies": CHURN_FIXTURE})
    importances = response.json()["feature_importances"]
    total = sum(importances.values())
    assert 0.99 <= total <= 1.01


def test_predict_churn_is_deterministic_across_calls():
    first = client.post("/predict-churn", json={"companies": CHURN_FIXTURE}).json()
    second = client.post("/predict-churn", json={"companies": CHURN_FIXTURE}).json()
    first_map = {p["company_id"]: p["churn_probability"] for p in first["predictions"]}
    second_map = {p["company_id"]: p["churn_probability"] for p in second["predictions"]}
    for cid in first_map:
        assert first_map[cid] == second_map[cid]


def test_predict_churn_reflects_underlying_risk_signal():
    response = client.post("/predict-churn", json={"companies": CHURN_FIXTURE})
    predictions = {p["company_id"]: p["churn_probability"] for p in response.json()["predictions"]}
    healthy_avg = sum(predictions[c["company_id"]] for c in CHURN_FIXTURE if not c["churned"]) / 30
    risk_avg = sum(predictions[c["company_id"]] for c in CHURN_FIXTURE if c["churned"]) / 10
    assert risk_avg > healthy_avg
