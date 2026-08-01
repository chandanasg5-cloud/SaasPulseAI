# SaaSPulse AI — Phase 6: Churn Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train a real XGBoost binary classifier predicting each active company's churn probability, with validated held-out performance metrics, deterministic per-company explainability, and a `/churn-risk` page surfacing the highest-risk accounts first.

**Architecture:** `ml-service` gets a new `POST /predict-churn` (scikit-learn train/test split + `xgboost.XGBClassifier`, held-out metrics, global feature importances). Encore fetches all companies' 7-feature vectors + actual churn labels, calls the endpoint, then runs pure TypeScript functions (risk banding, importance-weighted driver attribution, recommended action) before persisting one row per **active** company into the existing `ml_predictions` table via an `ensureChurnPredicted()` orchestrator mirroring Phase 5's `ensureSegmented()`.

**Tech Stack:** Encore.ts backend, scikit-learn + XGBoost ml-service, Next.js 15 frontend, vitest, pytest.

## Global Constraints

- **Anti-leakage** (Phase 1's locked-in decision): the training label is actual churn
  (`subscriptions.status='canceled' AND end_date<=now()`). The model must never see
  the seed script's hidden `company_health_factor`/`true_churn_probability` — those
  never exist in any table or API response.
- **Feature reuse, no redefinition**: `usage_score`/`adoption_score`/`support_score`/
  `revenue_score`/`seat_penetration_score` are Phase 4/5's existing pure functions,
  called directly — not reimplemented.
- **Features computed "as of now" uniformly for both churned and active companies** —
  verified against the seed generator (`generate/events.ts`) that event volume for
  churned companies isn't cut off at cancellation, so this doesn't create a trivial
  "no recent data ⇒ churned" shortcut.
- **Model config, always**: `XGBClassifier(n_estimators=100, max_depth=4,
  random_state=42)`, stratified 80/20 train/test split (`test_size=0.2,
  random_state=42, stratify=y`) for held-out metrics, then refit on the full dataset
  for the predictions actually persisted.
- **Risk bands**: `probability >= 0.5` → `high`, `0.2–0.49` → `medium`, `< 0.2` → `low`.
- **Driver dictionary and tie-break order, always** (fixed feature order: usage_score,
  adoption_score, support_score, revenue_score, seat_penetration_score, tenure_days,
  recency_days — first wins ties):

  | Feature | Driver label | Risk direction |
  |---|---|---|
  | `usage_score` | "Low Product Usage" | below population average |
  | `adoption_score` | "Weak Feature Adoption" | below population average |
  | `support_score` | "Elevated Support Activity" | below population average |
  | `revenue_score` | "Low Plan Value" | below population average |
  | `seat_penetration_score` | "Low Organizational Adoption" | below population average |
  | `tenure_days` | "Short Tenure" | below population average |
  | `recency_days` | "Inactive Recently" | **above** population average (only inverted feature) |

- **No new migration** — `ml_predictions.prediction_type`'s existing CHECK constraint
  already allows `'churn_probability'`; everything else fits the existing columns
  (`churn_probability`, `recommendation`, `main_drivers` JSONB).
- **Predictions persisted for active companies only** (same "not canceled" filter
  Phase 4/5 use), even though training uses all companies (both classes needed).
- **No mocking** — backend tests call the real running `ml-service` over HTTP
  (`ML_SERVICE_URL`, default `http://localhost:8001`), same convention since Phase 5.
- **JSONB insert convention** (learned the hard way in Phase 5 Task 7): pass the plain
  JS object directly as the `Primitive[]` row value for a JSONB column — never
  `JSON.stringify()` it first, which double-encodes it into an escaped string scalar.

---

## File Structure

**Backend (`backend/platform/`):**
- `metrics/churnFeatures.ts` (new) — `computeTenureDays`, `computeRecencyDays`
- `metrics/churnRiskLevel.ts` (new) — probability → risk band
- `metrics/churnRecommendedAction.ts` (new) — risk band + driver → action text
- `metrics/churnDrivers.ts` (new) — importance-weighted per-company driver ranking
- `mlClient.ts` (modify) — add churn-prediction types + `callChurnPredictionService`
- `churnPrediction.ts` (new) — `ensureChurnPredicted()` orchestrator
- `api.ts` (modify) — new `customerChurnRisk` endpoint, `GET /customers/churn-risk`

**ml-service (`ml-service/`):**
- `main.py` (modify) — new `POST /predict-churn`
- `requirements.txt` (modify) — add `xgboost`
- `test_main.py` (modify) — pytest coverage for `/predict-churn`

**Frontend (`frontend/`):**
- `lib/types.ts` (modify) — `ChurnRiskCard`, `ChurnRiskResponse`
- `lib/api.ts` (modify) — `getCustomerChurnRisk()`
- `components/ChurnRiskCard.tsx` (new)
- `app/churn-risk/page.tsx` (new)

---

### Task 1: Churn feature engineering — tenure and recency

**Files:**
- Create: `backend/platform/metrics/churnFeatures.ts`
- Create: `backend/platform/metrics/churnFeatures.test.ts`

**Interfaces:**
- Consumes: `ProductEventRow` from `./types` (already exists).
- Produces: `computeTenureDays(signupDate: Date, now: Date): number`,
  `computeRecencyDays(companyEvents: ProductEventRow[], tenureDays: number, now: Date):
  number` — both consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/metrics/churnFeatures.test.ts
import { describe, it, expect } from "vitest";
import { computeTenureDays, computeRecencyDays } from "./churnFeatures";
import type { ProductEventRow } from "./types";

describe("computeTenureDays", () => {
  it("computes whole days between signup and now", () => {
    const signup = new Date(2026, 0, 1);
    const now = new Date(2026, 0, 31);
    expect(computeTenureDays(signup, now)).toBe(30);
  });

  it("returns 0 if signup date is somehow after now (defensive)", () => {
    const signup = new Date(2026, 1, 1);
    const now = new Date(2026, 0, 1);
    expect(computeTenureDays(signup, now)).toBe(0);
  });
});

describe("computeRecencyDays", () => {
  const now = new Date(2026, 6, 30);

  it("computes days since the most recent event", () => {
    const events: ProductEventRow[] = [
      { user_id: "USR-1", feature_name: null, timestamp: new Date(2026, 6, 20) },
      { user_id: "USR-1", feature_name: null, timestamp: new Date(2026, 6, 25) },
      { user_id: "USR-1", feature_name: null, timestamp: new Date(2026, 6, 10) },
    ];
    // most recent event is 2026-07-25, now is 2026-07-30 -> 5 days
    expect(computeRecencyDays(events, 200, now)).toBe(5);
  });

  it("falls back to tenure_days when there are no events", () => {
    expect(computeRecencyDays([], 42, now)).toBe(42);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test metrics/churnFeatures.test.ts`
Expected: FAIL — `./churnFeatures` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/churnFeatures.ts
import type { ProductEventRow } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTenureDays(signupDate: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - signupDate.getTime()) / MS_PER_DAY));
}

export function computeRecencyDays(
  companyEvents: ProductEventRow[],
  tenureDays: number,
  now: Date,
): number {
  if (companyEvents.length === 0) return tenureDays;

  let mostRecent = companyEvents[0].timestamp;
  for (const e of companyEvents) {
    if (e.timestamp > mostRecent) mostRecent = e.timestamp;
  }
  return Math.max(0, Math.round((now.getTime() - mostRecent.getTime()) / MS_PER_DAY));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test metrics/churnFeatures.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/churnFeatures.ts backend/platform/metrics/churnFeatures.test.ts
git commit -m "feat(backend): add tenure and recency churn feature functions"
```

---

### Task 2: Churn risk banding and recommended action

**Files:**
- Create: `backend/platform/metrics/churnRiskLevel.ts`
- Create: `backend/platform/metrics/churnRiskLevel.test.ts`
- Create: `backend/platform/metrics/churnRecommendedAction.ts`
- Create: `backend/platform/metrics/churnRecommendedAction.test.ts`

**Interfaces:**
- Produces: `ChurnRiskLevel` type, `computeChurnRiskLevel(probability: number):
  ChurnRiskLevel`; `computeChurnRecommendedAction(riskLevel: ChurnRiskLevel,
  primaryRiskDriver: string): string` — both consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/metrics/churnRiskLevel.test.ts
import { describe, it, expect } from "vitest";
import { computeChurnRiskLevel } from "./churnRiskLevel";

describe("computeChurnRiskLevel", () => {
  it("bands >=0.5 as high", () => {
    expect(computeChurnRiskLevel(0.5)).toBe("high");
    expect(computeChurnRiskLevel(0.9)).toBe("high");
  });

  it("bands 0.2-0.49 as medium (inclusive lower bound)", () => {
    expect(computeChurnRiskLevel(0.2)).toBe("medium");
    expect(computeChurnRiskLevel(0.49)).toBe("medium");
  });

  it("bands <0.2 as low", () => {
    expect(computeChurnRiskLevel(0.19)).toBe("low");
    expect(computeChurnRiskLevel(0)).toBe("low");
  });
});
```

```typescript
// backend/platform/metrics/churnRecommendedAction.test.ts
import { describe, it, expect } from "vitest";
import { computeChurnRecommendedAction } from "./churnRecommendedAction";

describe("computeChurnRecommendedAction", () => {
  it("returns the healthy message for low risk regardless of driver", () => {
    expect(computeChurnRecommendedAction("low", "Low Product Usage")).toBe(
      "Healthy account — low churn risk, maintain regular touchpoints",
    );
  });

  it("returns non-urgent, driver-specific text for medium risk", () => {
    expect(computeChurnRecommendedAction("medium", "Inactive Recently")).toBe(
      "Reach out — no recent product activity detected",
    );
  });

  it("returns urgent, driver-specific text for high risk", () => {
    expect(computeChurnRecommendedAction("high", "Short Tenure")).toBe(
      "Urgent: high churn risk during onboarding — assign a dedicated success contact",
    );
  });

  it("falls back gracefully for an unrecognized driver", () => {
    expect(computeChurnRecommendedAction("high", "Something Unexpected")).toBe(
      "Urgent: review account health — elevated churn risk detected",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test metrics/churnRiskLevel.test.ts metrics/churnRecommendedAction.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/churnRiskLevel.ts
export type ChurnRiskLevel = "low" | "medium" | "high";

export function computeChurnRiskLevel(probability: number): ChurnRiskLevel {
  if (probability >= 0.5) return "high";
  if (probability >= 0.2) return "medium";
  return "low";
}
```

```typescript
// backend/platform/metrics/churnRecommendedAction.ts
import type { ChurnRiskLevel } from "./churnRiskLevel";

const MEDIUM_ACTIONS: Record<string, string> = {
  "Low Product Usage": "Re-engagement outreach recommended — usage has softened",
  "Weak Feature Adoption": "Offer a feature adoption walkthrough to increase usage depth",
  "Elevated Support Activity": "Review recent support history — proactively check in",
  "Low Plan Value": "Monitor for renewal risk given plan/payment status",
  "Low Organizational Adoption": "Encourage broader team rollout to increase seat usage",
  "Short Tenure": "New account — schedule an onboarding check-in to reinforce early value",
  "Inactive Recently": "Reach out — no recent product activity detected",
};

const HIGH_ACTIONS: Record<string, string> = {
  "Low Product Usage": "Urgent: re-engagement campaign needed — usage has dropped significantly",
  "Weak Feature Adoption": "Urgent: schedule an onboarding refresher — feature adoption is very low",
  "Elevated Support Activity": "Urgent: schedule a customer success check-in to resolve support issues",
  "Low Plan Value": "Urgent: address payment/plan issues before renewal",
  "Low Organizational Adoption": "Urgent: escalate to customer success — seat utilization is critically low",
  "Short Tenure": "Urgent: high churn risk during onboarding — assign a dedicated success contact",
  "Inactive Recently": "Urgent: immediate outreach required — account has gone dark",
};

export function computeChurnRecommendedAction(
  riskLevel: ChurnRiskLevel,
  primaryRiskDriver: string,
): string {
  if (riskLevel === "low") {
    return "Healthy account — low churn risk, maintain regular touchpoints";
  }
  const table = riskLevel === "high" ? HIGH_ACTIONS : MEDIUM_ACTIONS;
  return (
    table[primaryRiskDriver] ??
    (riskLevel === "high"
      ? "Urgent: review account health — elevated churn risk detected"
      : "Review account health — churn risk is elevated")
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test metrics/churnRiskLevel.test.ts metrics/churnRecommendedAction.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/churnRiskLevel.ts backend/platform/metrics/churnRiskLevel.test.ts \
  backend/platform/metrics/churnRecommendedAction.ts backend/platform/metrics/churnRecommendedAction.test.ts
git commit -m "feat(backend): add churn risk banding and recommended action"
```

---

### Task 3: Importance-weighted churn driver attribution

**Files:**
- Create: `backend/platform/metrics/churnDrivers.ts`
- Create: `backend/platform/metrics/churnDrivers.test.ts`

**Interfaces:**
- Produces: `ChurnFeatureVector` type, `FeatureImportances` type, `ChurnDrivers` type,
  `computeChurnDrivers(companyFeatures: ChurnFeatureVector, populationAverages:
  ChurnFeatureVector, importances: FeatureImportances): ChurnDrivers` — consumed by
  Task 6.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/platform/metrics/churnDrivers.test.ts
import { describe, it, expect } from "vitest";
import { computeChurnDrivers, type ChurnFeatureVector, type FeatureImportances } from "./churnDrivers";

describe("computeChurnDrivers", () => {
  const populationAverages: ChurnFeatureVector = {
    usage_score: 15, adoption_score: 15, support_score: 15, revenue_score: 15,
    seat_penetration_score: 15, tenure_days: 300, recency_days: 10,
  };
  const importances: FeatureImportances = {
    usage_score: 0.3, adoption_score: 0.1, support_score: 0.1, revenue_score: 0.1,
    seat_penetration_score: 0.1, tenure_days: 0.1, recency_days: 0.2,
  };

  it("picks the two largest weighted risk contributions", () => {
    const companyFeatures: ChurnFeatureVector = {
      usage_score: 5, // below avg by 10, importance 0.3 -> contribution 3.0 (largest)
      adoption_score: 15,
      support_score: 15,
      revenue_score: 15,
      seat_penetration_score: 15,
      tenure_days: 300,
      recency_days: 20, // above avg by 10, importance 0.2 -> contribution 2.0 (2nd largest)
    };
    const result = computeChurnDrivers(companyFeatures, populationAverages, importances);
    expect(result.primary_risk_driver).toBe("Low Product Usage");
    expect(result.secondary_risk_driver).toBe("Inactive Recently");
  });

  it("tie-breaks equal weighted contributions by fixed feature order", () => {
    const companyFeatures: ChurnFeatureVector = {
      usage_score: 15, adoption_score: 15,
      support_score: 5, // below avg by 10, importance 0.1 -> contribution 1.0
      revenue_score: 5, // below avg by 10, importance 0.1 -> contribution 1.0 (tied)
      seat_penetration_score: 15, tenure_days: 300, recency_days: 10,
    };
    const result = computeChurnDrivers(companyFeatures, populationAverages, importances);
    // support_score precedes revenue_score in the fixed feature order -> support wins
    expect(result.primary_risk_driver).toBe("Elevated Support Activity");
    expect(result.secondary_risk_driver).toBe("Low Plan Value");
  });

  it("correctly inverts recency_days direction (above average increases risk)", () => {
    const companyFeatures: ChurnFeatureVector = {
      usage_score: 15, adoption_score: 15, support_score: 15, revenue_score: 15,
      seat_penetration_score: 15, tenure_days: 300,
      recency_days: 100, // far above avg (10) -> high risk contribution
    };
    const result = computeChurnDrivers(companyFeatures, populationAverages, importances);
    expect(result.primary_risk_driver).toBe("Inactive Recently");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test metrics/churnDrivers.test.ts`
Expected: FAIL — `./churnDrivers` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/metrics/churnDrivers.ts
export interface ChurnFeatureVector {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
  tenure_days: number;
  recency_days: number;
}

export interface FeatureImportances {
  usage_score: number;
  adoption_score: number;
  support_score: number;
  revenue_score: number;
  seat_penetration_score: number;
  tenure_days: number;
  recency_days: number;
}

type FeatureKey = keyof ChurnFeatureVector;

const FEATURE_ORDER: FeatureKey[] = [
  "usage_score", "adoption_score", "support_score", "revenue_score",
  "seat_penetration_score", "tenure_days", "recency_days",
];

/** recency_days is the one feature where ABOVE average increases risk; all others are BELOW average. */
const INVERTED_FEATURES = new Set<FeatureKey>(["recency_days"]);

const DRIVER_LABELS: Record<FeatureKey, string> = {
  usage_score: "Low Product Usage",
  adoption_score: "Weak Feature Adoption",
  support_score: "Elevated Support Activity",
  revenue_score: "Low Plan Value",
  seat_penetration_score: "Low Organizational Adoption",
  tenure_days: "Short Tenure",
  recency_days: "Inactive Recently",
};

export interface ChurnDrivers {
  primary_risk_driver: string;
  secondary_risk_driver: string;
}

export function computeChurnDrivers(
  companyFeatures: ChurnFeatureVector,
  populationAverages: ChurnFeatureVector,
  importances: FeatureImportances,
): ChurnDrivers {
  const contributions = FEATURE_ORDER.map((key) => {
    const raw = INVERTED_FEATURES.has(key)
      ? companyFeatures[key] - populationAverages[key]
      : populationAverages[key] - companyFeatures[key];
    return { key, contribution: raw * importances[key] };
  });

  contributions.sort((a, b) => {
    if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    return FEATURE_ORDER.indexOf(a.key) - FEATURE_ORDER.indexOf(b.key);
  });

  return {
    primary_risk_driver: DRIVER_LABELS[contributions[0].key],
    secondary_risk_driver: DRIVER_LABELS[contributions[1].key],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test metrics/churnDrivers.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/metrics/churnDrivers.ts backend/platform/metrics/churnDrivers.test.ts
git commit -m "feat(backend): add importance-weighted churn driver attribution"
```

---

### Task 4: ml-service `/predict-churn` endpoint

**Files:**
- Modify: `ml-service/main.py`
- Modify: `ml-service/requirements.txt`
- Modify: `ml-service/test_main.py`

**Interfaces:**
- Produces: `POST /predict-churn` — request `{ companies: [{ company_id, usage_score,
  adoption_score, support_score, revenue_score, seat_penetration_score, tenure_days,
  recency_days, churned }] }`, response `{ predictions: [{ company_id,
  churn_probability }], feature_importances: { <7 feature keys>: number },
  metadata: { algorithm, algorithm_version, random_seed, generated_at,
  held_out_metrics: { accuracy, precision, recall, roc_auc } } }` — consumed by Task 5.

- [ ] **Step 1: Add xgboost to requirements.txt**

Replace the full contents of `ml-service/requirements.txt` with:

```
fastapi==0.115.0
uvicorn==0.30.6
httpx==0.27.2
pytest==8.3.3
scikit-learn==1.5.2
xgboost==2.1.1
```

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pip install -r requirements.txt`
Expected: installs `xgboost` and any remaining transitive deps without error.

- [ ] **Step 2: Write the failing tests**

Append to `ml-service/test_main.py` (keep all existing tests as-is):

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: the 5 new tests FAIL with a 404 (no `/predict-churn` route yet); existing
`/cluster` and `/health` tests still pass.

- [ ] **Step 4: Implement**

Add these imports to the top of `ml-service/main.py` (alongside the existing ones —
do not remove `KMeans`/`silhouette_score`, which the existing `/cluster` endpoint
still needs):

```python
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from xgboost import XGBClassifier
```

Append to the end of `ml-service/main.py`:

```python
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
```

(`RANDOM_SEED` and the `datetime`/`timezone` imports already exist at the top of
`main.py` from the `/cluster` endpoint — reuse them, don't redeclare.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: PASS, all tests (existing `/health`/`/cluster` tests plus the 5 new
`/predict-churn` tests). If `test_predict_churn_reflects_underlying_risk_signal` or
the determinism test proves flaky purely due to fixture separation/small-sample
randomness (not a logic bug), you may widen the fixture's healthy/at-risk score
ranges further apart while preserving the same 30/10 structure — this is normal
test-fixture engineering, not a deviation. If something else looks wrong, stop and
report rather than guessing.

- [ ] **Step 6: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add ml-service/main.py ml-service/requirements.txt ml-service/test_main.py
git commit -m "feat(ml-service): add /predict-churn endpoint using XGBoost"
```

---

### Task 5: Backend ml-service churn-prediction HTTP client

**Files:**
- Modify: `backend/platform/mlClient.ts`
- Modify: `backend/platform/mlClient.test.ts`

**Interfaces:**
- Consumes: Task 4's `POST /predict-churn` over HTTP.
- Produces: `ChurnRequestCompany`, `ChurnPrediction`, `ChurnMetrics`,
  `ChurnFeatureImportances`, `ChurnModelMetadata`, `ChurnPredictionResponse` types;
  `callChurnPredictionService(companies: ChurnRequestCompany[]):
  Promise<ChurnPredictionResponse>` — consumed by Task 6.

**Before running this task's tests**, start `ml-service` in the background (same
setup Phase 5 established):

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service"
.venv/bin/uvicorn main:app --port 8001 > /tmp/ml-service.log 2>&1 &
echo $! > /tmp/ml-service.pid
```

Verify: `curl -s http://127.0.0.1:8001/health` → `{"status":"ok"}`.

- [ ] **Step 1: Write the failing test**

Append to `backend/platform/mlClient.test.ts` (keep the existing `callClusterService`
test as-is):

```typescript
describe("callChurnPredictionService", () => {
  it("calls the real ml-service and returns predictions, importances, and metadata", async () => {
    const companies = [
      ...Array.from({ length: 15 }, (_, i) => ({
        company_id: `H-${i}`, usage_score: 22, adoption_score: 21, support_score: 20,
        revenue_score: 18, seat_penetration_score: 20, tenure_days: 400, recency_days: 2,
        churned: false,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        company_id: `R-${i}`, usage_score: 3, adoption_score: 4, support_score: 10,
        revenue_score: 5, seat_penetration_score: 3, tenure_days: 40, recency_days: 60,
        churned: true,
      })),
    ];

    const result = await callChurnPredictionService(companies);

    expect(result.predictions).toHaveLength(20);
    for (const p of result.predictions) {
      expect(p.churn_probability).toBeGreaterThanOrEqual(0);
      expect(p.churn_probability).toBeLessThanOrEqual(1);
    }
    expect(result.metadata.algorithm).toBe("xgboost");
    expect(result.metadata.random_seed).toBe(42);
    expect(typeof result.metadata.held_out_metrics.accuracy).toBe("number");
    expect(typeof result.feature_importances.usage_score).toBe("number");
  });
});
```

(Add `callChurnPredictionService` to the existing `import { callClusterService } from
"./mlClient";` line at the top of the test file — change it to `import {
callClusterService, callChurnPredictionService } from "./mlClient";`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test mlClient.test.ts`
Expected: FAIL — `callChurnPredictionService` is not exported.

- [ ] **Step 3: Implement**

Append to `backend/platform/mlClient.ts` (keep everything already in the file —
`ML_SERVICE_URL` is already declared at module scope, reuse it, don't redeclare):

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test mlClient.test.ts`
Expected: PASS, both tests (`callClusterService` and `callChurnPredictionService`).

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/mlClient.ts backend/platform/mlClient.test.ts
git commit -m "feat(backend): add ml-service HTTP client for churn predictions"
```

---

### Task 6: Churn prediction orchestrator — `ensureChurnPredicted()`

**Files:**
- Create: `backend/platform/churnPrediction.ts`
- Create: `backend/platform/churnPrediction.test.ts`

**Interfaces:**
- Consumes: `ensureSeeded` from `./seed`; `computeUsageScore`, `computeFeatureAdoptionScore`,
  `computeSupportScore`, `computeRevenueScore`, `computeSeatPenetrationScore` (Phase 4/5);
  `computeTenureDays`, `computeRecencyDays` from `./metrics/churnFeatures` (Task 1);
  `computeChurnRiskLevel` from `./metrics/churnRiskLevel` (Task 2);
  `computeChurnRecommendedAction` from `./metrics/churnRecommendedAction` (Task 2);
  `computeChurnDrivers`, `ChurnFeatureVector`, `FeatureImportances` from
  `./metrics/churnDrivers` (Task 3); `callChurnPredictionService`,
  `ChurnRequestCompany` from `./mlClient` (Task 5); `parseLocalDate` from
  `./metrics/months`; `CompanyEventRow`, `SupportTicketRow`, `UserRow`,
  `ProductEventRow` from `./metrics/types`.
- Produces: `ensureChurnPredicted(): Promise<void>`, `doPredict(): Promise<void>` —
  consumed by Task 7.

**Before running this task's tests**, `ml-service` must be running on port 8001 (same
setup as Task 5). Local Postgres (Docker) must also already be running.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/platform/churnPrediction.test.ts
import { describe, it, expect } from "vitest";
import { ensureChurnPredicted, doPredict } from "./churnPrediction";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("ensureChurnPredicted", () => {
  it("persists one churn_probability row per active company with all fields populated", async () => {
    await ensureSeeded();
    await ensureChurnPredicted();

    const activeCountRow = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
    `;
    const predictionCountRow = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'
    `;
    expect(predictionCountRow?.n).toBe(activeCountRow?.n);

    const sample = await db.queryRow<{
      churn_probability: number; recommendation: string; main_drivers: string;
    }>`
      SELECT churn_probability::float AS churn_probability, recommendation,
        main_drivers::text AS main_drivers
      FROM ml_predictions WHERE prediction_type = 'churn_probability' LIMIT 1
    `;
    expect(sample?.churn_probability).toBeGreaterThanOrEqual(0);
    expect(sample?.churn_probability).toBeLessThanOrEqual(1);
    expect(sample?.recommendation).toBeTruthy();

    const drivers = JSON.parse(sample!.main_drivers);
    expect(["low", "medium", "high"]).toContain(drivers.risk_level);
    expect(typeof drivers.primary_risk_driver).toBe("string");
    expect(typeof drivers.secondary_risk_driver).toBe("string");
    expect(typeof drivers.held_out_metrics.accuracy).toBe("number");
  });

  it("does not persist any row for churned (inactive) companies", async () => {
    await ensureChurnPredicted();
    const row = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n
      FROM ml_predictions p
      JOIN companies c ON c.id = p.company_id
      JOIN subscriptions s ON s.company_id = c.id
      WHERE p.prediction_type = 'churn_probability'
        AND s.status = 'canceled' AND s.end_date <= CURRENT_DATE
    `;
    expect(row?.n).toBe(0);
  });

  it("is idempotent — a second call does not duplicate rows", async () => {
    await ensureChurnPredicted();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'`;
    await ensureChurnPredicted();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'`;
    expect(after?.n).toBe(before?.n);
  });

  it("doPredict's DB-level guard prevents re-predicting when called directly a second time", async () => {
    await ensureChurnPredicted();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'`;
    await doPredict();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'`;
    expect(after?.n).toBe(before?.n);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && encore test churnPrediction.test.ts`
Expected: FAIL — `./churnPrediction` module not found.

- [ ] **Step 3: Implement**

```typescript
// backend/platform/churnPrediction.ts
import { db } from "./db";
import { computeUsageScore } from "./metrics/usageScore";
import { computeFeatureAdoptionScore } from "./metrics/featureAdoptionScore";
import { computeSupportScore } from "./metrics/supportScore";
import { computeRevenueScore } from "./metrics/revenueScore";
import { computeSeatPenetrationScore } from "./metrics/seatPenetrationScore";
import { computeTenureDays, computeRecencyDays } from "./metrics/churnFeatures";
import { computeChurnRiskLevel } from "./metrics/churnRiskLevel";
import { computeChurnRecommendedAction } from "./metrics/churnRecommendedAction";
import { computeChurnDrivers, type ChurnFeatureVector, type FeatureImportances } from "./metrics/churnDrivers";
import { callChurnPredictionService, type ChurnRequestCompany } from "./mlClient";
import { parseLocalDate } from "./metrics/months";
import type { CompanyEventRow, SupportTicketRow, UserRow, ProductEventRow } from "./metrics/types";
import type { Primitive, SQLDatabase, Transaction } from "encore.dev/storage/sqldb";

type Executor = SQLDatabase | Transaction;

interface ChurnCompanyRow {
  id: string;
  company_size: number;
  signup_date: string;
  plan_name: string;
  status: string;
  is_active: boolean;
}

interface CompanyFeatures extends ChurnFeatureVector {
  id: string;
  churned: boolean;
}

let churnPredicted: Promise<void> | null = null;

export function ensureChurnPredicted(): Promise<void> {
  if (!churnPredicted) churnPredicted = doPredict();
  return churnPredicted;
}

export async function doPredict(): Promise<void> {
  const existing = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'churn_probability'`;
  if (existing && existing.n > 0) return;

  const now = new Date();

  const companies: ChurnCompanyRow[] = [];
  for await (const r of db.query<ChurnCompanyRow>`
    SELECT c.id, c.company_size, c.signup_date::text AS signup_date,
      COALESCE(s.plan_name, 'none') AS plan_name,
      COALESCE(s.status, 'none') AS status,
      (s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)) AS is_active
    FROM companies c
    LEFT JOIN subscriptions s ON s.company_id = c.id
    ORDER BY c.id
  `) {
    companies.push(r);
  }
  if (companies.length === 0) return;

  const users: UserRow[] = [];
  for await (const r of db.query<UserRow>`SELECT id, company_id, first_login_at, created_at FROM users`) {
    users.push(r);
  }

  const events: CompanyEventRow[] = [];
  for await (const r of db.query<CompanyEventRow>`
    SELECT company_id, user_id, feature_name, "timestamp" FROM product_events
  `) {
    events.push(r);
  }

  const tickets: SupportTicketRow[] = [];
  for await (const r of db.query<SupportTicketRow>`SELECT company_id, priority, created_at FROM support_tickets`) {
    tickets.push(r);
  }

  const usersByCompany = new Map<string, UserRow[]>();
  for (const u of users) {
    const arr = usersByCompany.get(u.company_id) ?? [];
    arr.push(u);
    usersByCompany.set(u.company_id, arr);
  }

  const eventsByCompany = new Map<string, CompanyEventRow[]>();
  for (const e of events) {
    const arr = eventsByCompany.get(e.company_id) ?? [];
    arr.push(e);
    eventsByCompany.set(e.company_id, arr);
  }

  const ticketsByCompany = new Map<string, SupportTicketRow[]>();
  for (const t of tickets) {
    const arr = ticketsByCompany.get(t.company_id) ?? [];
    arr.push(t);
    ticketsByCompany.set(t.company_id, arr);
  }

  const features: CompanyFeatures[] = companies.map((c) => {
    const companyUsers = usersByCompany.get(c.id) ?? [];
    const companyEvents = eventsByCompany.get(c.id) ?? [];
    const companyTickets = ticketsByCompany.get(c.id) ?? [];
    const productEventRows: ProductEventRow[] = companyEvents.map((e) => ({
      user_id: e.user_id,
      feature_name: e.feature_name,
      timestamp: e.timestamp,
    }));

    const tenureDays = computeTenureDays(parseLocalDate(c.signup_date), now);

    return {
      id: c.id,
      usage_score: computeUsageScore(companyUsers, productEventRows, now),
      adoption_score: computeFeatureAdoptionScore(productEventRows, now),
      support_score: computeSupportScore(companyTickets, now),
      revenue_score: computeRevenueScore({ plan_name: c.plan_name, status: c.status }),
      seat_penetration_score: computeSeatPenetrationScore(companyUsers, productEventRows, c.company_size, now),
      tenure_days: tenureDays,
      recency_days: computeRecencyDays(productEventRows, tenureDays, now),
      churned: !c.is_active,
    };
  });

  const churnRequest: ChurnRequestCompany[] = features.map((f) => ({
    company_id: f.id,
    usage_score: f.usage_score,
    adoption_score: f.adoption_score,
    support_score: f.support_score,
    revenue_score: f.revenue_score,
    seat_penetration_score: f.seat_penetration_score,
    tenure_days: f.tenure_days,
    recency_days: f.recency_days,
    churned: f.churned,
  }));

  const result = await callChurnPredictionService(churnRequest);
  if (result.predictions.length !== features.length) {
    throw new Error(
      `ml-service returned ${result.predictions.length} predictions for ${features.length} companies`,
    );
  }

  const populationAverages: ChurnFeatureVector = {
    usage_score: average(features.map((f) => f.usage_score)),
    adoption_score: average(features.map((f) => f.adoption_score)),
    support_score: average(features.map((f) => f.support_score)),
    revenue_score: average(features.map((f) => f.revenue_score)),
    seat_penetration_score: average(features.map((f) => f.seat_penetration_score)),
    tenure_days: average(features.map((f) => f.tenure_days)),
    recency_days: average(features.map((f) => f.recency_days)),
  };

  const importances: FeatureImportances = result.feature_importances;
  const featuresById = new Map(features.map((f) => [f.id, f]));
  const activeCompanyIds = new Set(companies.filter((c) => c.is_active).map((c) => c.id));

  const today = now.toISOString().slice(0, 10);
  const columns = [
    "id", "company_id", "prediction_type", "prediction_date",
    "churn_probability", "segment_label", "main_drivers", "recommendation", "model_version",
  ];
  const rows: Primitive[][] = [];
  let idx = 0;

  for (const prediction of result.predictions) {
    if (!activeCompanyIds.has(prediction.company_id)) continue;
    const f = featuresById.get(prediction.company_id);
    if (!f) continue;

    const featureVector: ChurnFeatureVector = {
      usage_score: f.usage_score,
      adoption_score: f.adoption_score,
      support_score: f.support_score,
      revenue_score: f.revenue_score,
      seat_penetration_score: f.seat_penetration_score,
      tenure_days: f.tenure_days,
      recency_days: f.recency_days,
    };
    const riskLevel = computeChurnRiskLevel(prediction.churn_probability);
    const drivers = computeChurnDrivers(featureVector, populationAverages, importances);
    const recommendation = computeChurnRecommendedAction(riskLevel, drivers.primary_risk_driver);

    const mainDrivers = {
      ...featureVector,
      risk_level: riskLevel,
      primary_risk_driver: drivers.primary_risk_driver,
      secondary_risk_driver: drivers.secondary_risk_driver,
      algorithm: result.metadata.algorithm,
      algorithm_version: result.metadata.algorithm_version,
      random_seed: result.metadata.random_seed,
      generated_at: result.metadata.generated_at,
      held_out_metrics: result.metadata.held_out_metrics,
    };

    rows.push([
      `CHURN-${String(idx + 1).padStart(5, "0")}`,
      prediction.company_id,
      "churn_probability",
      today,
      prediction.churn_probability,
      null,
      mainDrivers,
      recommendation,
      "xgboost-v1",
    ]);
    idx++;
  }

  const tx = await db.begin();
  try {
    await batchInsert(tx, columns, rows);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function batchInsert(
  executor: Executor,
  columns: string[],
  rows: Primitive[][],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueClauses: string[] = [];
    const params: Primitive[] = [];
    batch.forEach((row, rowIdx) => {
      const placeholders = row.map((_, colIdx) => `$${rowIdx * row.length + colIdx + 1}`);
      valueClauses.push(`(${placeholders.join(", ")})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ml_predictions (${columns.join(", ")}) VALUES ${valueClauses.join(", ")}`;
    await executor.rawExec(sql, ...params);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && encore test churnPrediction.test.ts`
Expected: PASS, all 4 tests. (Requires `ml-service` running on port 8001; this call
trains XGBoost against ~1000 real companies, which takes real wall-clock time — that's
expected, not a hang.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/churnPrediction.ts backend/platform/churnPrediction.test.ts
git commit -m "feat(backend): add ensureChurnPredicted() orchestrator persisting to ml_predictions"
```

---

### Task 7: `GET /customers/churn-risk` endpoint

**Files:**
- Modify: `backend/platform/api.ts`
- Modify: `backend/platform/api.test.ts`

**Interfaces:**
- Consumes: `ensureChurnPredicted` from `./churnPrediction` (Task 6).
- Produces: `customerChurnRisk` exported Encore API handler at `GET /customers/churn-risk`.

- [ ] **Step 1: Write the failing test**

Add `customerChurnRisk` to the existing import line at the top of
`backend/platform/api.test.ts` (change `import { customerHealthScores,
customerSegments } from "./api";` to also include `customerChurnRisk`), then append:

```typescript
describe("customerChurnRisk", () => {
  it("returns active companies sorted by churn probability descending", async () => {
    const res = await customerChurnRisk({ page: 1, pageSize: 100 });
    expect(res.companies.length).toBeGreaterThan(0);
    expect(res.total).toBeGreaterThan(0);

    for (let i = 1; i < res.companies.length; i++) {
      expect(res.companies[i].churn_probability).toBeLessThanOrEqual(res.companies[i - 1].churn_probability);
    }

    for (const c of res.companies) {
      expect(["low", "medium", "high"]).toContain(c.risk_level);
      expect(c.recommendation.length).toBeGreaterThan(0);
    }
  });

  it("paginates correctly", async () => {
    const page1 = await customerChurnRisk({ page: 1, pageSize: 10 });
    expect(page1.companies).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && encore test api.test.ts`
Expected: FAIL — `customerChurnRisk is not a function`.

- [ ] **Step 3: Implement**

Add `import { ensureChurnPredicted } from "./churnPrediction";` near the other
imports at the top of `backend/platform/api.ts`, then append to the end of the file:

```typescript
interface ChurnPredictionRow {
  company_id: string;
  company_name: string;
  churn_probability: number;
  recommendation: string;
  main_drivers: string;
}

interface ChurnRiskCard {
  company_id: string;
  company_name: string;
  churn_probability: number;
  risk_level: string;
  primary_risk_driver: string;
  secondary_risk_driver: string;
  recommendation: string;
}

interface CustomerChurnRiskParams {
  page?: Query<number>;
  pageSize?: Query<number>;
}

export const customerChurnRisk = api(
  { method: "GET", path: "/customers/churn-risk", expose: true },
  async (params: CustomerChurnRiskParams): Promise<{ companies: ChurnRiskCard[]; total: number }> => {
    await ensureChurnPredicted();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));

    const rows: ChurnPredictionRow[] = [];
    for await (const r of db.query<ChurnPredictionRow>`
      SELECT p.company_id, c.name AS company_name, p.churn_probability::float AS churn_probability,
        p.recommendation, p.main_drivers::text AS main_drivers
      FROM ml_predictions p
      JOIN companies c ON c.id = p.company_id
      WHERE p.prediction_type = 'churn_probability'
    `) {
      rows.push(r);
    }

    const allCards: ChurnRiskCard[] = rows
      .map((r) => {
        const drivers = JSON.parse(r.main_drivers);
        return {
          company_id: r.company_id,
          company_name: r.company_name,
          churn_probability: r.churn_probability,
          risk_level: drivers.risk_level,
          primary_risk_driver: drivers.primary_risk_driver,
          secondary_risk_driver: drivers.secondary_risk_driver,
          recommendation: r.recommendation,
        };
      })
      .sort((a, b) => b.churn_probability - a.churn_probability);

    const total = allCards.length;
    const start = (page - 1) * pageSize;
    const companies = allCards.slice(start, start + pageSize);

    return { companies, total };
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && encore test api.test.ts`
Expected: PASS, all tests in the file. (Requires `ml-service` running on port 8001.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add backend/platform/api.ts backend/platform/api.test.ts
git commit -m "feat(backend): add customers/churn-risk endpoint"
```

---

### Task 8: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

**Interfaces:**
- Produces: `ChurnRiskCard`, `ChurnRiskResponse` types;
  `getCustomerChurnRisk(page?: number, pageSize?: number): Promise<ChurnRiskResponse>`
  — consumed by Tasks 9-10.

- [ ] **Step 1: Add the response types**

Append to `frontend/lib/types.ts`:

```typescript
export interface ChurnRiskCard {
  company_id: string;
  company_name: string;
  churn_probability: number;
  risk_level: string;
  primary_risk_driver: string;
  secondary_risk_driver: string;
  recommendation: string;
}

export interface ChurnRiskResponse {
  companies: ChurnRiskCard[];
  total: number;
}
```

- [ ] **Step 2: Add the API client function**

Merge `ChurnRiskResponse` into the existing type-only import line at the top of
`frontend/lib/api.ts` (it currently reads `import type { CompaniesResponse,
ExecutiveOverview, ProductOverview, CustomerHealthScoresResponse, SegmentsResponse }
from "./types";`), then append:

```typescript
export async function getCustomerChurnRisk(page = 1, pageSize = 25): Promise<ChurnRiskResponse> {
  const res = await fetch(`${API}/customers/churn-risk?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /customers/churn-risk failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): add churn-risk types and API client"
```

---

### Task 9: `ChurnRiskCard` component

**Files:**
- Create: `frontend/components/ChurnRiskCard.tsx`

**Interfaces:**
- Consumes: `ChurnRiskCard` type from `@/lib/types` (Task 8) — note the naming
  collision with this component's own name, resolved via an import alias (see code
  below).
- Produces: `ChurnRiskCard({ company }: { company: ChurnRiskCardData })` — consumed
  by Task 10.

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/ChurnRiskCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ChurnRiskCard as ChurnRiskCardData } from "@/lib/types";

const RISK_LABELS: Record<string, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

const RISK_DOT_VAR: Record<string, string> = {
  low: "var(--status-good)",
  medium: "var(--status-warning)",
  high: "var(--status-critical)",
};

export function ChurnRiskCard({ company }: { company: ChurnRiskCardData }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{company.company_name}</CardTitle>
        <Badge variant="outline" className="gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: RISK_DOT_VAR[company.risk_level] ?? "var(--chart-axis-muted)" }}
          />
          {RISK_LABELS[company.risk_level] ?? company.risk_level}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-semibold">
          {(company.churn_probability * 100).toFixed(0)}
          <span className="text-sm font-normal text-muted-foreground">% churn probability</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {company.primary_risk_driver} · {company.secondary_risk_driver}
        </p>
        <p className="text-sm text-muted-foreground">{company.recommendation}</p>
      </CardContent>
    </Card>
  );
}
```

The component and the imported type share the name `ChurnRiskCard` (matching this
project's convention — see `CustomerCard.tsx` consuming `CustomerHealthCard`, and
`SegmentCard.tsx` consuming `SegmentSummary`, neither of which needed an alias since
their names didn't collide). Here they DO collide, so the type import uses `as
ChurnRiskCardData` to avoid a redeclaration error — this is required, not optional.

Reuses Phase 4's exact status-color + icon+label pattern (colored dot beside a text
label, never a background-tinted badge) — no new CSS needed.

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/components/ChurnRiskCard.tsx
git commit -m "feat(frontend): add ChurnRiskCard component"
```

---

### Task 10: `/churn-risk` page, final verification

**Files:**
- Create: `frontend/app/churn-risk/page.tsx`

**Interfaces:**
- Consumes: `getCustomerChurnRisk` from `@/lib/api` (Task 8); `ChurnRiskCard` from
  `@/components/ChurnRiskCard` (Task 9).

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/churn-risk/page.tsx
import { getCustomerChurnRisk } from "@/lib/api";
import { ChurnRiskCard } from "@/components/ChurnRiskCard";

const PAGE_SIZE = 25;

export default async function ChurnRiskPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { companies, total } = await getCustomerChurnRisk(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Churn Risk</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => (
          <ChurnRiskCard key={c.company_id} company={c} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <a
          href={`/churn-risk?page=${page - 1}`}
          aria-disabled={page <= 1}
          className={`text-sm underline ${page <= 1 ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          ← Previous
        </a>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <a
          href={`/churn-risk?page=${page + 1}`}
          aria-disabled={page >= totalPages}
          className={`text-sm underline ${page >= totalPages ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          Next →
        </a>
      </div>
    </main>
  );
}
```

Same pagination convention as `/customers` (Phase 4) — `Promise`-typed `searchParams`
per Next.js 15, `Math.max(1, Number(params.page) || 1)` clamp.

- [ ] **Step 2: Verify with the type checker**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/frontend" && npx tsc --noEmit`
Expected: no errors — should be fully clean.

- [ ] **Step 3: Manual verification against the real backend and ml-service**

With Docker/Postgres running, `ml-service` running (`cd ml-service && .venv/bin/uvicorn
main:app --port 8001`), and the Encore backend running (`cd backend && encore run`),
briefly start the frontend (this project's established convention — never a
long-running `next dev` session) and confirm:
- The list renders real companies, sorted with the highest churn probability first
  (spot-check: the first card's probability should be >= the second's, etc.)
- Each card shows a real percentage, risk badge with a visibly-colored dot, both
  driver strings, and recommendation text — not placeholders
- Pagination (`?page=2`) shows different companies than page 1
- Use a real browser render (Playwright-driven Chromium, already available in this
  project's scratchpad) to confirm the risk dot's actual computed `background-color`
  resolves to one of `--status-good`/`--status-warning`/`--status-critical`

- [ ] **Step 4: Run the full test suites one more time**

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/ml-service" && .venv/bin/pytest -v`
Expected: all tests pass.

Run: `cd "/Users/chandanagowda/Desktop/SaasPluseAI/backend" && encore test`
Expected: all tests pass, no regressions across the whole Phase 6 body of work (or
earlier phases).

- [ ] **Step 5: Commit and push**

```bash
cd "/Users/chandanagowda/Desktop/SaasPluseAI"
git add frontend/app/churn-risk/page.tsx
git commit -m "feat(frontend): add /churn-risk page with predicted risk cards"
git push origin main
```
