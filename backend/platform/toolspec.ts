// Pure tool metadata shared by the agent loop, the Gemini client, and the
// executor. No encore/db imports — unit-testable without a database.

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: "STRING" | "NUMBER"; description: string }>;
    required: string[];
  };
}

export const toolDeclarations: ToolDeclaration[] = [
  {
    name: "get_executive_overview",
    description:
      "Get executive KPIs and charts: MRR, ARR, revenue growth, CAC, CLV, churn rate, NRR, " +
      "revenue trend, MRR waterfall, customer growth, subscription breakdown by plan tier.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_product_overview",
    description:
      "Get product usage KPIs: DAU/WAU/MAU, stickiness, feature adoption rate, the 5-stage " +
      "activation funnel, feature usage ranking, engagement trend, cohort retention.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_customer_segments",
    description:
      "Get the 4 customer personas (Power Users, Expansion Opportunity, High Value Low " +
      "Engagement, At Risk) with company counts, percentages, and average sub-scores for each.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_top_churn_risks",
    description:
      "Get the companies with the highest predicted churn probability, sorted highest-risk " +
      "first, with risk level, top risk drivers, and a recommended action for each.",
    parameters: {
      type: "OBJECT",
      properties: { limit: { type: "NUMBER", description: "How many companies to return (default 10, max 50)" } },
      required: [],
    },
  },
  {
    name: "get_company_profile",
    description:
      "Look up ONE specific company by name and get its health score, customer segment, and churn risk together.",
    parameters: {
      type: "OBJECT",
      properties: { company_name: { type: "STRING", description: "The company name to look up, e.g. 'Acme Corp'" } },
      required: ["company_name"],
    },
  },
];

export function validateToolArgs(
  name: string,
  args: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const decl = toolDeclarations.find((d) => d.name === name);
  if (!decl) return { ok: false, error: `unknown tool ${name}` };
  for (const req of decl.parameters.required) {
    const v = args[req];
    if (typeof v !== "string" || v.trim() === "") {
      return { ok: false, error: `missing or empty argument ${req} for ${name}` };
    }
  }
  return { ok: true };
}

export function stepLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "get_executive_overview": return "Checking executive overview";
    case "get_product_overview": return "Checking product analytics";
    case "get_customer_segments": return "Checking customer segments";
    case "get_top_churn_risks": return "Checking churn risk";
    case "get_company_profile": {
      const company = typeof args.company_name === "string" ? args.company_name : "?";
      return `Looking up ${company}`;
    }
    default:
      return `Running ${name}`;
  }
}
