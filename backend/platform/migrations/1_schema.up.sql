-- backend/platform/migrations/1_schema.up.sql

CREATE TABLE companies (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    industry       TEXT NOT NULL,
    company_size   INTEGER NOT NULL,
    plan_tier      TEXT NOT NULL CHECK (plan_tier IN ('free','starter','professional','enterprise')),
    customer_stage TEXT NOT NULL CHECK (customer_stage IN ('trial','onboarding','active','growing','power_user','at_risk','churned')),
    signup_date    DATE NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id             TEXT PRIMARY KEY,
    company_id     TEXT NOT NULL REFERENCES companies(id),
    email          TEXT NOT NULL,
    role           TEXT NOT NULL,
    first_login_at TIMESTAMPTZ,
    last_login_at  TIMESTAMPTZ,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_company_id_idx ON users(company_id);

CREATE TABLE subscriptions (
    id            TEXT PRIMARY KEY,
    company_id    TEXT NOT NULL REFERENCES companies(id),
    plan_name     TEXT NOT NULL,
    mrr_amount    NUMERIC(10,2) NOT NULL,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
    status        TEXT NOT NULL CHECK (status IN ('active','canceled','trialing','past_due')),
    start_date    DATE NOT NULL,
    end_date      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_company_id_idx ON subscriptions(company_id);

CREATE TABLE subscription_events (
    subscription_event_id TEXT PRIMARY KEY,
    company_id            TEXT NOT NULL REFERENCES companies(id),
    event_date            DATE NOT NULL,
    event_type            TEXT NOT NULL CHECK (event_type IN ('new_subscription','upgrade','downgrade','cancellation','renewal')),
    previous_plan         TEXT,
    new_plan              TEXT,
    mrr_change            NUMERIC(10,2) NOT NULL
);
CREATE INDEX subscription_events_company_id_idx ON subscription_events(company_id);
CREATE INDEX subscription_events_event_date_idx ON subscription_events(event_date);

CREATE TABLE product_events (
    event_id         TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id),
    company_id       TEXT NOT NULL REFERENCES companies(id),
    "timestamp"      TIMESTAMPTZ NOT NULL,
    event_name       TEXT NOT NULL,
    feature_name     TEXT,
    session_duration INTEGER NOT NULL,
    device_type      TEXT NOT NULL CHECK (device_type IN ('desktop','mobile','tablet'))
);
CREATE INDEX product_events_company_id_idx ON product_events(company_id);
CREATE INDEX product_events_user_id_idx ON product_events(user_id);
CREATE INDEX product_events_timestamp_idx ON product_events("timestamp");

CREATE TABLE support_tickets (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies(id),
    user_id     TEXT REFERENCES users(id),
    subject     TEXT NOT NULL,
    priority    TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
    status      TEXT NOT NULL CHECK (status IN ('open','closed','pending')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX support_tickets_company_id_idx ON support_tickets(company_id);

CREATE TABLE customer_health_scores (
    id                  TEXT PRIMARY KEY,
    company_id          TEXT NOT NULL REFERENCES companies(id),
    score_date          DATE NOT NULL,
    usage_score         NUMERIC(5,2) NOT NULL,
    adoption_score      NUMERIC(5,2) NOT NULL,
    support_score       NUMERIC(5,2) NOT NULL,
    revenue_score       NUMERIC(5,2) NOT NULL,
    overall_score       NUMERIC(5,2) NOT NULL,
    risk_level          TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
    recommended_action  TEXT NOT NULL
);
CREATE INDEX customer_health_scores_company_id_idx ON customer_health_scores(company_id);

CREATE TABLE ml_predictions (
    id                TEXT PRIMARY KEY,
    company_id        TEXT NOT NULL REFERENCES companies(id),
    prediction_type   TEXT NOT NULL CHECK (prediction_type IN ('churn_probability','segment')),
    prediction_date   DATE NOT NULL,
    churn_probability NUMERIC(5,4),
    segment_label     TEXT,
    main_drivers      JSONB,
    recommendation    TEXT,
    model_version     TEXT NOT NULL
);
CREATE INDEX ml_predictions_company_id_idx ON ml_predictions(company_id);
