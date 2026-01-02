import React from "react";
import { Outlet, Link, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/plugins", label: "Plugins", icon: Plug },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/events", label: "Events", icon: Zap },
  { to: "/workflows", label: "Workflows", icon: Workflow },
  { to: "/schedules", label: "Schedules", icon: Calendar },
  { to: "/rules", label: "Rules", icon: GitBranch },
  { to: "/logs", label: "Logs", icon: FileText },
  { to: "/store", label: "Store", icon: Package },
] as const;

function NavLink({ to, label, icon: Icon }: (typeof NAV_ITEMS)[number]) {
  const match = useMatchRoute();
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
      {label}
    </Link>
  );
}

export function RootLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            ELIA
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Home Automation Hub</p>
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
