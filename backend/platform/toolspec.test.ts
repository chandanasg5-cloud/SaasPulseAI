import { describe, it, expect } from "vitest";
import { toolDeclarations, validateToolArgs, stepLabel } from "./toolspec";

describe("toolDeclarations", () => {
  it("declares exactly the 5 expected tools", () => {
    const names = toolDeclarations.map((d) => d.name);
    expect(names).toEqual([
      "get_executive_overview", "get_product_overview", "get_customer_segments",
      "get_top_churn_risks", "get_company_profile",
    ]);
  });
});

describe("validateToolArgs", () => {
  it("accepts a known tool with no required args", () => {
    expect(validateToolArgs("get_executive_overview", {})).toEqual({ ok: true });
  });

  it("accepts get_company_profile with a non-empty company_name", () => {
    expect(validateToolArgs("get_company_profile", { company_name: "Acme" })).toEqual({ ok: true });
  });

  it("rejects get_company_profile with a missing company_name", () => {
    expect(validateToolArgs("get_company_profile", {}).ok).toBe(false);
  });

  it("rejects get_company_profile with an empty-string company_name", () => {
    expect(validateToolArgs("get_company_profile", { company_name: "   " }).ok).toBe(false);
  });

  it("rejects an unknown tool name", () => {
    expect(validateToolArgs("delete_everything", {}).ok).toBe(false);
  });
});

describe("stepLabel", () => {
  it("labels each of the 5 tools distinctly", () => {
    expect(stepLabel("get_executive_overview", {})).toBe("Checking executive overview");
    expect(stepLabel("get_product_overview", {})).toBe("Checking product analytics");
    expect(stepLabel("get_customer_segments", {})).toBe("Checking customer segments");
    expect(stepLabel("get_top_churn_risks", {})).toBe("Checking churn risk");
    expect(stepLabel("get_company_profile", { company_name: "Acme" })).toBe("Looking up Acme");
  });

  it("falls back gracefully for an unknown tool", () => {
    expect(stepLabel("mystery_tool", {})).toBe("Running mystery_tool");
  });
});
