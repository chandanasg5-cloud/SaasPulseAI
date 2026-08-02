import { describe, it, expect } from "vitest";
import { getCompanyProfile } from "./companyProfile";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("getCompanyProfile", () => {
  it("returns found:false for a company name with no match", async () => {
    await ensureSeeded();
    const result = await getCompanyProfile("Definitely Not A Real Company Name XYZ123");
    expect(result.found).toBe(false);
  });

  // Gated below: any match triggers ensureSegmented()/ensureChurnPredicted(),
  // which hit the real ml-service over the network — unreachable from Encore
  // Cloud's build-time test gate. Run locally with RUN_ML_SERVICE_TESTS=1.
  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("finds a real company by exact name (case-insensitive) and returns a full profile", async () => {
    await ensureSeeded();
    const row = await db.queryRow<{ name: string }>`SELECT name FROM companies ORDER BY id LIMIT 1`;
    const result = await getCompanyProfile(row!.name.toUpperCase());
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.company.name).toBe(row!.name);
      expect(result.company.health.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.company.health.overall_score).toBeLessThanOrEqual(100);
      expect(["low", "medium", "high"]).toContain(result.company.health.risk_level);
    }
  });

  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("finds a real company by partial name match", async () => {
    await ensureSeeded();
    const row = await db.queryRow<{ name: string }>`SELECT name FROM companies ORDER BY id LIMIT 1`;
    const partial = row!.name.slice(0, Math.max(3, Math.floor(row!.name.length / 2)));
    const result = await getCompanyProfile(partial);
    expect(result.found).toBe(true);
  });

  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("returns null segment_label and churn for a churned company", async () => {
    await ensureSeeded();
    const churned = await db.queryRow<{ name: string }>`
      SELECT c.name FROM companies c
      JOIN subscriptions s ON s.company_id = c.id
      WHERE s.status = 'canceled' AND s.end_date <= CURRENT_DATE
      ORDER BY c.id LIMIT 1
    `;
    const result = await getCompanyProfile(churned!.name);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.company.segment_label).toBeNull();
      expect(result.company.churn).toBeNull();
    }
  });

  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("returns real segment_label and churn data for an active company", async () => {
    await ensureSeeded();
    const active = await db.queryRow<{ name: string }>`
      SELECT c.name FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
      ORDER BY c.id LIMIT 1
    `;
    const result = await getCompanyProfile(active!.name);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(typeof result.company.segment_label).toBe("string");
      expect(result.company.churn).not.toBeNull();
      if (result.company.churn) {
        expect(result.company.churn.probability).toBeGreaterThanOrEqual(0);
        expect(result.company.churn.probability).toBeLessThanOrEqual(1);
      }
    }
  });
});
