// frontend/app/customers/page.tsx
import { getCustomerHealthScores } from "@/lib/api";
import { CustomerCard } from "@/components/CustomerCard";
import { SearchBar } from "@/components/SearchBar";

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const { customers, total } = await getCustomerHealthScores(page, PAGE_SIZE, q);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qSuffix = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">SaaSPulse AI — Customer Intelligence</h1>

      <SearchBar action="/customers" query={q} />

      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No customers match &quot;{q}&quot;.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <CustomerCard key={c.company_id} customer={c} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <a
          href={`/customers?page=${page - 1}${qSuffix}`}
          aria-disabled={page <= 1}
          className={`text-sm underline ${page <= 1 ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          ← Previous
        </a>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <a
          href={`/customers?page=${page + 1}${qSuffix}`}
          aria-disabled={page >= totalPages}
          className={`text-sm underline ${page >= totalPages ? "pointer-events-none text-muted-foreground" : ""}`}
        >
          Next →
        </a>
      </div>
    </main>
  );
}
