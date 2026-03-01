import { useQuery } from '@tanstack/react-query';
import { useSparkStream } from '@/features/events';
import { usePlugins } from '@/features/plugins';
import {
  DashboardHeader,
  QuickActionsCard,
  RecentSparks,
  type Stats,
  StatsGrid,
  SystemStatusCard,
} from './components';
import { useHealth } from './hooks';

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchStats(): Promise<Stats> {
  const res = await fetch('/api/system');
  if (!res.ok) {
    throw new Error('Failed to fetch system info');
  }
  const data = await res.json();
  return data.stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data: health } = useHealth();
  const { data: plugins = [] } = usePlugins();
  const { events: sparks } = useSparkStream();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: [
      'stats',
    ],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  const runningPlugins = plugins.filter((p) => p.status === 'running').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader health={health} />

      {/* Stats Grid */}
      <StatsGrid stats={stats} isLoading={statsLoading} />

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Sparks */}
        <RecentSparks sparks={sparks} />

        {/* Quick Actions & System Status */}
        <div className="flex flex-col gap-6">
          <QuickActionsCard />
          <SystemStatusCard
            health={health}
            runningPlugins={runningPlugins}
            totalPlugins={plugins.length}
            totalSparks={stats?.sparks.total ?? 0}
            totalBlocks={stats?.blocks.total ?? 0}
            totalBricks={stats?.bricks?.total ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
