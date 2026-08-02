import { describe, it, expect } from "vitest";
import { ensureChurnPredicted, doPredict } from "./churnPrediction";
import { ensureSeeded } from "./seed";
import { db } from "./db";

// Gated: hits the real ml-service over the network, which Encore Cloud's
// build-time test gate cannot reach. Run locally with RUN_ML_SERVICE_TESTS=1.
describe.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("ensureChurnPredicted", () => {
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
