import { Box, Plug, Workflow, Zap } from 'lucide-react';
import { useDataView } from '@/components/DataView';
import { useLocale } from '@/lib/use-locale';
import { StatCard } from './StatCard';
import { StatCardSkeleton } from './StatCardSkeleton';

export interface Stats {
  plugins: { total: number; running: number };
  blocks: { total: number };
  workflows: { total: number; enabled: number };
  sparks: { total: number };
}

export interface StatsGridProps {
  stats: Stats | undefined;
  isLoading: boolean;
}

export function StatsGrid({ stats, isLoading }: Readonly<StatsGridProps>) {
  const { t } = useLocale();

  const StatsView = useDataView({
    data: stats,
    isLoading,
    isEmpty: (s) => !s,
  });

  return (
    <StatsView.Root>
      <StatsView.Skeleton>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      </StatsView.Skeleton>

      <StatsView.Content>
        {(stats) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Plug}
              label={t('dashboard:stats.plugins')}
              value={stats.plugins.running}
              subValue={t('dashboard:stats.running')}
              href="/plugins"
              accent="blue"
            />
            <StatCard
              icon={Box}
              label={t('dashboard:stats.blocks')}
              value={stats.blocks.total}
              href="/workflows"
              accent="violet"
            />
            <StatCard
              icon={Workflow}
              label={t('dashboard:stats.workflows')}
              value={stats.workflows.enabled}
              subValue={t('dashboard:stats.enabled')}
              href="/workflows"
              accent="orange"
            />
            <StatCard
              icon={Zap}
              label={t('dashboard:stats.sparks')}
              value={stats.sparks.total}
              subValue={t('dashboard:stats.registered')}
              href="/sparks"
              accent="emerald"
            />
          </div>
        )}
      </StatsView.Content>
    </StatsView.Root>
  );
}
