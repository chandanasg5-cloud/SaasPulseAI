# API Reference

All endpoints are served by the Encore `platform` service (default local URL
`http://localhost:4000`). None require authentication — this is a portfolio
demo. For live, interactive docs generated directly from the running service,
use Encore's local dashboard (its URL is printed in the terminal when you run
`encore run`, typically `http://localhost:9400`) — that's the authoritative
source; this file is a static reference that can drift if endpoints change
without this doc being updated.

## Foundation

### `GET /health`
Health check. Response: `{ status: "ok" }`

### `GET /companies/count`
Response: `{ total_companies: number, active_companies: number, churned_companies: number }`

### `GET /companies`
Params (all optional, query string): `page: number`, `pageSize: number` (max
100), `planTier: string`, `industry: string`
Response: `{ companies: [{ id, name, industry, plan_tier, customer_stage, mrr }], total: number }`

## Executive Command Center (Module 1)

### `GET /metrics/executive-overview`
No params. Response:
```json
{
  "kpis": {
    "mrr": 0, "arr": 0, "revenue_growth_pct": 0, "customer_count": 0,
    "cac": 0, "clv": 0, "churn_rate_pct": 0, "nrr_pct": 0
  },
  "charts": {
    "revenue_trend": [{ "month": "2026-01", "mrr": 0 }],
    "mrr_waterfall": {
      "starting_mrr": 0, "new_mrr": 0, "expansion_mrr": 0,
      "contraction_mrr": 0, "churned_mrr": 0, "ending_mrr": 0
    },
    "customer_growth": [{ "month": "2026-01", "active_customers": 0 }],
    "subscription_breakdown": [{ "plan_tier": "free", "count": 0, "mrr": 0 }]
  }
}
```

## Product Analytics (Module 2)

### `GET /metrics/product-overview`
No params. Response:
```json
{
  "kpis": { "dau": 0, "wau": 0, "mau": 0, "stickiness_pct": 0, "feature_adoption_pct": 0 },
  "funnel": [{ "stage": "signup", "count": 0 }],
  "charts": {
    "feature_usage_ranking": [{ "feature_name": "dashboard", "event_count": 0 }],
    "engagement_trend": [{ "date": "2026-07-01", "dau": 0, "wau": 0, "mau": 0 }],
    "cohort_retention": [{ "cohort_month": "2026-01", "months_since_signup": 0, "retention_pct": 0 }]
  }
}
```

## Customer Intelligence (Module 3)

### `GET /customers/health-scores`
Params: `page: number`, `pageSize: number` (max 100)
Response: `{ customers: [{ company_id, company_name, plan_tier, usage_score, adoption_score, support_score, revenue_score, overall_score, risk_level, recommended_action }], total: number }`
Active companies only (excludes churned).

## Customer Segmentation (Module 4)

### `GET /customers/segments`
No params — always returns all 4 personas, in fixed order (Power Users,
Expansion Opportunity, High Value, Low Engagement, At Risk), never sorted by
size.
Response: `{ segments: [{ segment_label, company_count, pct_of_total, avg_usage_score, avg_adoption_score, avg_support_score, avg_revenue_score, avg_seat_penetration_score }] }`

## Churn Prediction (Module 5)

### `GET /customers/churn-risk`
Params: `page: number`, `pageSize: number` (max 100)
Response: `{ companies: [{ company_id, company_name, churn_probability, risk_level, primary_risk_driver, secondary_risk_driver, recommendation }], total: number }`
Active companies only, sorted by `churn_probability` descending (highest risk
first).

### `GET /customers/churn-risk/distribution`
No params. Response: `{ high: number, medium: number, low: number, total: number }`
— count of active companies at each churn risk level (`high + medium + low ===
total`). Powers the Churn Risk Distribution donut on the Overview dashboard.

## AI Analyst Copilot (Module 6)

### `GET /companies/profile?name=`
Params (required): `name: string` — case-insensitive exact match first, falls
back to a partial match.
Response (found): `{ found: true, company: { id, name, industry, plan_tier, health: {...}, segment_label, churn: {...} } }`
Response (not found): `{ found: false, company: null }`

### `POST /chat`
Body: `{ messages: [{ role: "user"|"model", text: string }] }` — must end with
a `user` message; the client resends up to the last 20 messages each turn
(this project keeps no server-side chat history).

Response: Server-Sent Events (`Content-Type: text/event-stream`), one JSON
object per `data:` line:
- `{"type":"step","tool":"...","label":"..."}` — a tool is being called
- `{"type":"text","text":"..."}` — a streamed answer text chunk
- `{"type":"error","message":"..."}` — a failure occurred
- `{"type":"done"}` — stream complete (always sent, even after an error)
