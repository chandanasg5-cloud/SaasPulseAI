import {
  BarChart3,
  Boxes,
  Home,
  Sparkles,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/product", label: "Analytics", icon: BarChart3 },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/segments", label: "Segments", icon: Boxes },
  { href: "/churn-risk", label: "Churn Prediction", icon: TrendingDown },
  { href: "/copilot", label: "AI Analyst", icon: Sparkles },
];
