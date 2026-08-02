import { describe, it, expect } from "vitest";
import { runChatTool } from "./chatTools";
import { ensureSeeded } from "./seed";
import { db } from "./db";

describe("runChatTool", () => {
  it("returns a formatted executive overview", async () => {
    await ensureSeeded();
    const result = await runChatTool("get_executive_overview", {});
    expect(result).toContain("MRR:");
    expect(result).toContain("Churn rate:");
  });

  it("returns a formatted product overview", async () => {
    const result = await runChatTool("get_product_overview", {});
    expect(result).toContain("DAU:");
    expect(result).toContain("Activation funnel:");
  });

  // Gated below: these transitively hit the real ml-service over the
  // network, unreachable from Encore Cloud's build-time test gate. Run
  // locally with RUN_ML_SERVICE_TESTS=1.
  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("returns a formatted customer segments summary", async () => {
    const result = await runChatTool("get_customer_segments", {});
    expect(result).toContain("Power Users");
    expect(result).toContain("At Risk");
  });

  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("returns a formatted top-N churn risk list respecting the limit argument", async () => {
    const result = await runChatTool("get_top_churn_risks", { limit: 3 });
    expect(result).toContain("Top 3 highest-risk companies");
  });

  it.skipIf(!process.env.RUN_ML_SERVICE_TESTS)("returns a formatted company profile for a real company", async () => {
    const row = await db.queryRow<{ name: string }>`SELECT name FROM companies ORDER BY id LIMIT 1`;
    const result = await runChatTool("get_company_profile", { company_name: row!.name });
    expect(result).toContain(row!.name);
  });

  it("returns a validation error for get_company_profile with a missing company_name", async () => {
    const result = await runChatTool("get_company_profile", {});
    expect(result).toContain("Error:");
  });

  it("returns an error string for an unknown tool rather than throwing", async () => {
    const result = await runChatTool("delete_everything", {});
    expect(result).toContain("Error:");
  });
});
