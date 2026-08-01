// frontend/app/churn-risk/page.tsx
import { getCustomerChurnRisk } from "@/lib/api";
import { ChurnRiskCard } from "@/components/ChurnRiskCard";

const PAGE_SIZE = 25;

export default async function ChurnRiskPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { companies, total } = await getCustomerChurnRisk(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Churn Risk</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => (
          <ChurnRiskCard key={c.company_id} company={c} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <a
          href={`/churn-risk?page=${page - 1}`}
          aria-disabled={page <= 1}
          className={`text-sm underline ${page <= 1 ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          ← Previous
        </a>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <a
          href={`/churn-risk?page=${page + 1}`}
          aria-disabled={page >= totalPages}
          className={`text-sm underline ${page >= totalPages ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          Next →
        </a>
      </div>
    </main>
  );
}
