import { executiveOverview, productOverview, customerSegments, customerChurnRisk } from "./api";
import { getCompanyProfile } from "./companyProfile";
import { validateToolArgs } from "./toolspec";
import {
  formatExecutiveOverview, formatProductOverview, formatCustomerSegments,
  formatChurnRisks, formatCompanyProfile,
} from "./chatFormat";

export async function runChatTool(name: string, args: Record<string, unknown>): Promise<string> {
  const v = validateToolArgs(name, args);
  if (!v.ok) return `Error: ${v.error}`;

  switch (name) {
    case "get_executive_overview": {
      const data = await executiveOverview();
      return formatExecutiveOverview(data);
    }
    case "get_product_overview": {
      const data = await productOverview();
      return formatProductOverview(data);
    }
    case "get_customer_segments": {
      const data = await customerSegments();
      return formatCustomerSegments(data);
    }
    case "get_top_churn_risks": {
      const limitArg = typeof args.limit === "number" ? args.limit : 10;
      const limit = Math.max(1, Math.min(limitArg, 50));
      const data = await customerChurnRisk({ page: 1, pageSize: limit });
      return formatChurnRisks(data);
    }
    case "get_company_profile": {
      const result = await getCompanyProfile(args.company_name as string);
      return formatCompanyProfile(result);
    }
    default:
      return `Error: unknown tool ${name}`;
  }
}
