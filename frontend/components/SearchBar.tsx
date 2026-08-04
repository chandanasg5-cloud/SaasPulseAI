import { Button } from "@/components/ui/button";

export function SearchBar({
  action,
  query,
  placeholder = "Search by company name…",
}: {
  action: string;
  query: string;
  placeholder?: string;
}) {
  return (
    <form action={action} method="get" className="flex items-center gap-2">
      <input
        type="text"
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        aria-label="Search by company name"
        className="h-8 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <Button type="submit" variant="outline">
        Search
      </Button>
      {query.trim() !== "" && (
        <a href={action} className="text-sm text-muted-foreground underline">
          Clear
        </a>
      )}
    </form>
  );
}
