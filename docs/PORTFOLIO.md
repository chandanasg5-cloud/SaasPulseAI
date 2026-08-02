# Portfolio Copy

## LinkedIn "Projects" description

> **SaaSPulse AI** — Built a full-stack, AI-powered SaaS product analytics
> platform from scratch as a portfolio project: 6 modules covering executive
> KPIs, product analytics, customer health scoring, ML-driven customer
> segmentation, a trained churn-prediction model, and a conversational AI
> analyst copilot. Backend on Encore.ts (TypeScript, owns its own Postgres),
> frontend on Next.js 15/React 19, a real Python ML service (scikit-learn
> k-means clustering + an XGBoost churn classifier with validated held-out
> metrics), and a Google Gemini-powered chat assistant that answers business
> questions by calling the platform's own live endpoints as tools — never
> fabricating numbers. All data is synthetic; architecture and process (specs,
> plans, code review) are production-shaped throughout.

## Resume bullets

- Architected and built a 6-module full-stack SaaS analytics platform
  (Encore.ts, Next.js 15, Python/scikit-learn/XGBoost, Google Gemini) spanning
  executive reporting, product analytics, customer health scoring, ML
  clustering, churn prediction, and an LLM-powered analyst copilot.
- Trained and validated an XGBoost binary classifier to predict customer churn
  probability from behavioral and firmographic signals, with a held-out
  train/test split reporting real accuracy/precision/recall/AUC rather than
  training-set-only metrics.
- Implemented k-means customer segmentation (scikit-learn) clustering the
  customer base into 4 actionable personas, with deterministic,
  importance-weighted driver attribution explaining each segment assignment
  in plain language.
- Built a Gemini function-calling AI copilot (Google `@google/genai`) that
  answers natural-language business questions by dynamically calling the
  platform's own real API endpoints as tools, streamed over Server-Sent
  Events, with a rate-limit-aware testing strategy (gated end-to-end tests)
  to protect free-tier LLM quota.
- Designed and executed the entire build as 8 sequential phases (spec → plan
  → implementation → automated review), each independently tested and
  code-reviewed before merging, producing dozens of backend test files and
  fully type-checked frontend/backend/ML codebases.
