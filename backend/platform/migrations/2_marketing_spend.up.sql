-- backend/platform/migrations/2_marketing_spend.up.sql
CREATE TABLE marketing_spend (
    id     TEXT PRIMARY KEY,
    month  DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL
);
CREATE INDEX marketing_spend_month_idx ON marketing_spend(month);
