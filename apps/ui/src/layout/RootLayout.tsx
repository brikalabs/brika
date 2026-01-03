import { Outlet, Link, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/use-locale";
import {
  LayoutDashboard,
  Plug,
  Wrench,
  Zap,
  Calendar,
  GitBranch,
  FileText,
  Package,
  Workflow,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav:dashboard", icon: LayoutDashboard },
  { to: "/plugins", labelKey: "nav:plugins", icon: Plug },
  { to: "/tools", labelKey: "nav:tools", icon: Wrench },
  { to: "/events", labelKey: "nav:events", icon: Zap },
  { to: "/workflows", labelKey: "nav:workflows", icon: Workflow },
  { to: "/schedules", labelKey: "nav:schedules", icon: Calendar },
  { to: "/rules", labelKey: "nav:rules", icon: GitBranch },
  { to: "/logs", labelKey: "nav:logs", icon: FileText },
  { to: "/store", labelKey: "nav:store", icon: Package },
  { to: "/settings", labelKey: "nav:settings", icon: Settings },
];

function NavLink({ to, labelKey, icon: Icon }: NavItem) {
  const match = useMatchRoute();
  const { t } = useLocale();
  const isActive = to === "/" ? match({ to: "/" }) : match({ to, fuzzy: true });

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {t(labelKey)}
    </Link>
  );
}

export function RootLayout() {
  const { t } = useLocale();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            ELIA
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard:subtitle")}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground">v0.1.0 · Bun Runtime</div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
