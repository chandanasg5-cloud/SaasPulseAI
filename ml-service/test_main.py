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
