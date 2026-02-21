/**
 * SystemInfoStats Component
 *
 * Stats section of system info (plugins, blocks, workflows, sparks, bricks).
 */

import { Blocks, LayoutGrid, Plug, Workflow, Zap } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { InfoItem } from './InfoItem';

interface SystemStats {
  plugins: { total: number; running: number };
  blocks: { total: number };
  workflows: { total: number; enabled: number };
  sparks: { total: number };
  bricks: { total: number };
}

interface SystemInfoStatsProps {
  stats: SystemStats;
}

export function SystemInfoStats({ stats }: Readonly<SystemInfoStatsProps>) {
  const { t } = useLocale();

  return (
    <>
      <InfoItem
        icon={Plug}
        label={t('settings:system.plugins')}
        value={stats.plugins.total}
        secondary={
          stats.plugins.total ? t('settings:system.pluginsRunning', stats.plugins) : undefined
        }
        mono={false}
      />
      <InfoItem
        icon={Blocks}
        label={t('settings:system.blocks')}
        value={stats.blocks.total}
        mono={false}
      />
      <InfoItem
        icon={Workflow}
        label={t('settings:system.workflows')}
        value={stats.workflows.total}
        secondary={
          stats.workflows.total ? t('settings:system.workflowsEnabled', stats.workflows) : undefined
        }
        mono={false}
      />
      <InfoItem
        icon={Zap}
        label={t('settings:system.sparks')}
        value={stats.sparks.total}
        mono={false}
      />
      <InfoItem
        icon={LayoutGrid}
        label={t('settings:system.bricks')}
        value={stats.bricks.total}
        mono={false}
      />
    </>
  );
}
