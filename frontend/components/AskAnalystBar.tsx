import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AskAnalystBar() {
  return (
    <Card
      style={{
        background:
          "linear-gradient(90deg, color-mix(in oklab, var(--series-1) 12%, transparent), color-mix(in oklab, var(--series-3) 10%, transparent))",
      }}
    >
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--series-1)" }}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <p className="shrink-0 text-sm font-semibold">Ask AI Product Analyst</p>
        <form action="/copilot" method="get" className="flex min-w-48 flex-1 items-center gap-2">
          <input
            name="q"
            placeholder="Why did churn increase last quarter?"
            className="min-w-0 flex-1 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            aria-label="Ask the AI analyst"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: "var(--series-1)" }}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
