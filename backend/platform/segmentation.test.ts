import { describe, it, expect } from "vitest";
import { ensureSegmented, doSegment } from "./segmentation";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("ensureSegmented", () => {
  it("persists one segment row per active company with all fields populated", async () => {
    await ensureSeeded();
    await ensureSegmented();

    const activeCountRow = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      WHERE s.id IS NULL OR NOT (s.status = 'canceled' AND s.end_date <= CURRENT_DATE)
    `;
    const segmentCountRow = await db.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'
    `;
    expect(segmentCountRow?.n).toBe(activeCountRow?.n);

    const sample = await db.queryRow<{ segment_label: string; main_drivers: string }>`
      SELECT segment_label, main_drivers::text AS main_drivers
      FROM ml_predictions WHERE prediction_type = 'segment' LIMIT 1
    `;
    expect(sample?.segment_label).toBeTruthy();
    const drivers = JSON.parse(sample!.main_drivers);
    expect(typeof drivers.cluster_confidence).toBe("number");
    expect(drivers.cluster_confidence).toBeGreaterThanOrEqual(0);
    expect(drivers.cluster_confidence).toBeLessThanOrEqual(1);
    expect(typeof drivers.distance_to_centroid).toBe("number");
    expect(drivers.distance_to_centroid).toBeGreaterThanOrEqual(0);
    expect(typeof drivers.primary_driver).toBe("string");
    expect(typeof drivers.secondary_driver).toBe("string");
  });

  it("only ever produces the 4 fixed persona labels", async () => {
    await ensureSegmented();
    const rows = db.query<{ segment_label: string }>`
      SELECT DISTINCT segment_label FROM ml_predictions WHERE prediction_type = 'segment'
    `;
    const labels: string[] = [];
    for await (const r of rows) labels.push(r.segment_label);
    for (const label of labels) {
      expect(["Power Users", "Expansion Opportunity", "High Value, Low Engagement", "At Risk"]).toContain(label);
    }
  });

  it("is idempotent — a second call does not duplicate rows", async () => {
    await ensureSegmented();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    await ensureSegmented();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    expect(after?.n).toBe(before?.n);
  });

  it("doSegment's DB-level guard prevents reseeding when called directly a second time", async () => {
    await ensureSegmented();
    const before = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    await doSegment();
    const after = await db.queryRow`SELECT COUNT(*)::int AS n FROM ml_predictions WHERE prediction_type = 'segment'`;
    expect(after?.n).toBe(before?.n);
  });
});
