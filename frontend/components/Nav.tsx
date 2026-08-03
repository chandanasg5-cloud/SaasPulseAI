"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/product", label: "Product" },
  { href: "/customers", label: "Customers" },
  { href: "/segments", label: "Segments" },
  { href: "/churn-risk", label: "Churn Risk" },
  { href: "/copilot", label: "Copilot" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b" style={{ backgroundColor: "var(--nav-tint)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">SaaSPulse AI</span>
          <div className="flex gap-4">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm transition-colors hover:text-[var(--series-1)]",
                    active ? "font-medium" : "text-muted-foreground",
                  )}
                  style={active ? { color: "var(--series-1)" } : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <ThemeToggle />
      </div>
    </nav>
  );
}
