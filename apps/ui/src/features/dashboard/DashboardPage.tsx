import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { VariantProps } from 'class-variance-authority';
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
} from 'lucide-react';
import type React from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardIconSmall,
  CardTitle,
  cardVariants,
  ScrollArea,
} from '@/components/ui';
import { useEventStream } from '@/features/events';
import { usePlugins } from '@/features/plugins';
import { useTools } from '@/features/tools';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { useHealth } from './hooks';

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
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

type Accent = VariantProps<typeof cardVariants>['accent'];

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subValue?: string;
  href: string;
  accent: Accent;
}

function StatCard({ icon: Icon, label, value, subValue, href, accent }: Readonly<StatCardProps>) {
  return (
    <Link to={href}>
      <Card accent={accent} interactive className="h-full p-5">
        <div className="relative flex h-full flex-col justify-center">
          <CardIconSmall className="absolute top-0 right-0">
            <Icon className="size-4" />
          </CardIconSmall>
          <div className="pr-10 font-bold text-3xl tracking-tight">{value}</div>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-muted-foreground text-sm transition-colors group-hover:text-foreground">
            <span className="truncate">
              {subValue && <span className="font-medium">{subValue} </span>}
              {label}
            </span>
            <ArrowRight className="size-3 shrink-0 -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  accent,
}: Readonly<{
  icon: React.ElementType;
  label: string;
  href: string;
  accent: Accent;
}>) {
  return (
    <Link to={href}>
      <Card accent={accent} interactive className="p-3">
        <div className="relative flex items-center gap-3">
          <CardIconSmall>
            <Icon className="size-4" />
          </CardIconSmall>
          <span className="font-medium text-sm transition-colors group-hover:text-foreground">
            {label}
          </span>
          <ArrowRight className="ml-auto size-4 -translate-x-2 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
      </Card>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { t, formatTime } = useLocale();
  const { data: health } = useHealth();
  const { data: plugins = [] } = usePlugins();
  const { data: tools = [] } = useTools();
  const { events } = useEventStream();

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  const runningPlugins = plugins.filter((p) => p.status === 'running').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="bg-linear-to-r from-foreground to-foreground/70 bg-clip-text font-bold text-3xl tracking-tight">
            {t('dashboard:title')}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-muted-foreground">
            <Sparkles className="size-4" />
            {t('dashboard:subtitle')}
          </p>
        </div>
        <Badge
          variant={health?.ok ? 'default' : 'destructive'}
          className={cn(
            'gap-2 px-3 py-1.5 text-sm',
            health?.ok && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
          )}
        >
          <Activity className={cn('size-4', health?.ok && 'animate-pulse')} />
          {health?.ok ? t('common:status.running') : t('common:status.stopped')}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Plug}
          label={t('dashboard:stats.plugins')}
          value={stats?.plugins.running ?? runningPlugins}
          subValue={t('dashboard:stats.running')}
          href="/plugins"
          accent="blue"
        />
        <StatCard
          icon={Wrench}
          label={t('dashboard:stats.tools')}
          value={stats?.tools.total ?? tools.length}
          href="/tools"
          accent="emerald"
        />
        <StatCard
          icon={Box}
          label={t('dashboard:stats.blocks')}
          value={stats?.blocks.total ?? 0}
          href="/workflows"
          accent="violet"
        />
        <StatCard
          icon={Workflow}
          label={t('dashboard:stats.workflows')}
          value={stats?.workflows.enabled ?? 0}
          subValue={t('dashboard:stats.enabled')}
          href="/workflows"
          accent="orange"
        />
        <StatCard
          icon={Calendar}
          label={t('dashboard:stats.schedules')}
          value={stats?.schedules.enabled ?? 0}
          subValue={t('dashboard:stats.enabled')}
          href="/schedules"
          accent="purple"
        />
        <StatCard
          icon={GitBranch}
          label={t('dashboard:stats.rules')}
          value={stats?.rules.enabled ?? 0}
          subValue={t('dashboard:stats.enabled')}
          href="/rules"
          accent="amber"
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
                  {t('events:title')}
                </CardTitle>
                <CardDescription>{t('events:subtitle')}</CardDescription>
              </div>
              <Badge variant="secondary">{events.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="-mx-2 h-70 px-2">
              <div className="flex flex-col gap-2">
                {events
                  .slice(-8)
                  .reverse()
                  .map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-lg bg-muted/30 p-2.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                        <Zap className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium font-mono text-sm">{e.type}</div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <span>{e.source}</span>
                          {e.payload && Object.keys(e.payload as object).length > 0 && (
                            <>
                              <span className="text-muted-foreground/50">•</span>
                              <span className="max-w-50 truncate">
                                {JSON.stringify(e.payload).slice(0, 50)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                        {formatTime(e.ts)}
                      </span>
                    </div>
                  ))}
                {events.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Zap className="mb-3 size-10 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">{t('events:empty')}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Quick Actions & System Status */}
        <div className="flex flex-col gap-6">
          {/* Quick Actions */}
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="size-4 text-primary" />
                {t('common:actions.create')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <QuickAction
                icon={Workflow}
                label={t('workflows:actions.create')}
                href="/workflows"
                accent="orange"
              />
              <QuickAction
                icon={Calendar}
                label={t('schedules:actions.create')}
                href="/schedules"
                accent="purple"
              />
              <QuickAction
                icon={GitBranch}
                label={t('rules:actions.create')}
                href="/rules"
                accent="amber"
              />
              <QuickAction icon={Plug} label={t('nav:plugins')} href="/plugins" accent="blue" />
            </CardContent>
          </Card>

          {/* System Status */}
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4 text-primary" />
                {t('common:labels.status')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
                <span className="text-sm">{t('dashboard:stats.plugins')}</span>
                <Badge
                  variant={health?.ok ? 'default' : 'destructive'}
                  className={cn(
                    health?.ok && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                  )}
                >
                  {health?.ok ? t('common:status.running') : t('common:status.stopped')}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
                <span className="text-sm">{t('dashboard:stats.plugins')}</span>
                <Badge variant="secondary">
                  {runningPlugins} / {plugins.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
                <span className="text-sm">{t('dashboard:stats.tools')}</span>
                <Badge variant="secondary">{tools.length}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
                <span className="text-sm">{t('dashboard:stats.blocks')}</span>
                <Badge variant="secondary">{stats?.blocks.total ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
