import { describe, it, expect } from "vitest";
import { db } from "./db";

describe("schema", () => {
  it("has all eight platform tables", async () => {
    const rows = db.query<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const names = new Set<string>();
    for await (const r of rows) names.add(r.table_name);

    for (const table of [
      "companies", "users", "subscriptions", "subscription_events",
      "product_events", "support_tickets", "customer_health_scores", "ml_predictions",
    ]) {
      expect(names.has(table)).toBe(true);
    }
  });

  it("has the marketing_spend table", async () => {
    const rows = db.query<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'marketing_spend'
    `;
    const names: string[] = [];
    for await (const r of rows) names.push(r.table_name);
    expect(names).toContain("marketing_spend");
  });
});
