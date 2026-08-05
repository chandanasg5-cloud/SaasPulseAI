"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_ITEMS } from "@/lib/navItems";

export function TopBar() {
  const pathname = usePathname();
  const label = NAV_ITEMS.find((item) => item.href === pathname)?.label ?? "SaaSPulse AI";

  return (
    <header
      className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur"
      style={{ backgroundColor: "var(--nav-tint)" }}
    >
      <SidebarTrigger />
      <span className="text-sm font-semibold">{label}</span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
