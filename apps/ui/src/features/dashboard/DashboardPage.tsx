import type React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useHealth } from "./hooks";
import { usePlugins } from "@/features/plugins";
import { useTools } from "@/features/tools";
import { useEventStream } from "@/features/events";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "@/components/ui";
import {
  Activity,
  ArrowRight,
  Box,
  Calendar,
  GitBranch,
  Play,
  Plug,
  Server,
  Sparkles,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

interface Stats {
  plugins: { total: number; running: number };
  tools: { total: number };
  blocks: { total: number; byCategory: Record<string, unknown[]> };
  workflows: { total: number; enabled: number };
  schedules: { total: number; enabled: number };
  rules: { total: number; enabled: number };
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subValue?: string;
  href: string;
  color: string;
  trend?: "up" | "down" | "neutral";
}

function StatCard({ icon: Icon, label, value, subValue, href, color }: Readonly<StatCardProps>) {
  return (
    <Link to={href}>
      <Card className="hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer group overflow-hidden relative">
        <div className={cn("absolute inset-0 opacity-5", color.replace("text-", "bg-"))} />
        <CardContent className="pt-6 relative">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold tracking-tight">{value}</div>
              {subValue && <div className="text-sm text-muted-foreground mt-0.5">{subValue}</div>}
              <div className="text-sm text-muted-foreground mt-1 group-hover:text-foreground transition-colors flex items-center gap-1">
                {label}
                <ArrowRight className="size-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
            </div>
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-xl",
                `${color.replace("text-", "bg-")}/10`,
              )}
            >
              <Icon className={cn("size-6", color)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  color,
}: Readonly<{
  icon: React.ElementType;
  label: string;
  href: string;
  color: string;
}>) {
  return (
    <Link to={href}>
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card",
          "hover:bg-accent hover:border-accent-foreground/20 transition-all cursor-pointer group",
        )}
      >
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            `${color.replace("text-", "bg-")}/10`,
          )}
        >
          <Icon className={cn("size-4", color)} />
        </div>
        <span className="text-sm font-medium group-hover:text-primary transition-colors">{label}</span>
        <ArrowRight className="size-4 ml-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-muted-foreground" />
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data: health } = useHealth();
  const { data: plugins = [] } = usePlugins();
  const { data: tools = [] } = useTools();
  const { events } = useEventStream();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  const runningPlugins = plugins.filter((p) => p.status === "running").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-foreground to-foreground/70 bg-clip-text">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Sparkles className="size-4" />
            ELIA Home Automation Hub
          </p>
        </div>
        <Badge
          variant={health?.ok ? "default" : "destructive"}
          className={cn(
            "gap-2 px-3 py-1.5 text-sm",
            health?.ok && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
          )}
        >
          <Activity className={cn("size-4", health?.ok && "animate-pulse")} />
          {health?.ok ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Plug}
          label="Plugins"
          value={stats?.plugins.running ?? runningPlugins}
          subValue={`of ${stats?.plugins.total ?? plugins.length} active`}
          href="/plugins"
          color="text-blue-500"
        />
        <StatCard
          icon={Wrench}
          label="Tools"
          value={stats?.tools.total ?? tools.length}
          subValue="registered"
          href="/tools"
          color="text-emerald-500"
        />
        <StatCard
          icon={Box}
          label="Blocks"
          value={stats?.blocks.total ?? 0}
          subValue={`${Object.keys(stats?.blocks.byCategory ?? {}).length} categories`}
          href="/workflows"
          color="text-violet-500"
        />
        <StatCard
          icon={Workflow}
          label="Workflows"
          value={stats?.workflows.enabled ?? 0}
          subValue={`of ${stats?.workflows.total ?? 0} enabled`}
          href="/workflows"
          color="text-orange-500"
        />
        <StatCard
          icon={Calendar}
          label="Schedules"
          value={stats?.schedules.enabled ?? 0}
          subValue={`of ${stats?.schedules.total ?? 0} active`}
          href="/schedules"
          color="text-purple-500"
        />
        <StatCard
          icon={GitBranch}
          label="Rules"
          value={stats?.rules.enabled ?? 0}
          subValue={`of ${stats?.rules.total ?? 0} active`}
          href="/rules"
          color="text-amber-500"
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Events */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-5 text-primary" />
                  Recent Events
                </CardTitle>
                <CardDescription>Live event stream from all sources</CardDescription>
              </div>
              <Badge variant="secondary">{events.length} events</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-70 -mx-2 px-2">
              <div className="space-y-2">
                {events
                  .slice(-8)
                  .reverse()
                  .map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                        <Zap className="size-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-medium truncate">{e.type}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{e.source}</span>
                          {e.payload && Object.keys(e.payload as object).length > 0 && (
                            <>
                              <span className="text-muted-foreground/50">•</span>
                              <span className="truncate max-w-50">
                                {JSON.stringify(e.payload).slice(0, 50)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {new Date(e.ts).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                {events.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Zap className="size-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No events yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Events will appear here in real-time
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Quick Actions & System Status */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="size-4 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QuickAction
                icon={Workflow}
                label="Create Workflow"
                href="/workflows"
                color="text-orange-500"
              />
              <QuickAction icon={Calendar} label="Add Schedule" href="/schedules" color="text-purple-500" />
              <QuickAction icon={GitBranch} label="Create Rule" href="/rules" color="text-amber-500" />
              <QuickAction icon={Plug} label="Manage Plugins" href="/plugins" color="text-blue-500" />
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4 text-primary" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <span className="text-sm">Hub Status</span>
                <Badge
                  variant={health?.ok ? "default" : "destructive"}
                  className={cn(health?.ok && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20")}
                >
                  {health?.ok ? "Online" : "Offline"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <span className="text-sm">Active Plugins</span>
                <Badge variant="secondary">
                  {runningPlugins} / {plugins.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <span className="text-sm">Registered Tools</span>
                <Badge variant="secondary">{tools.length}</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <span className="text-sm">Available Blocks</span>
                <Badge variant="secondary">{stats?.blocks.total ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
