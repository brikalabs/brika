import { Avatar, AvatarFallback, Card, Progress } from '@brika/clay';
import { HardDrive } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import type { DiskRootUsage, PluginDiskUsage as PluginDiskUsageType } from '../api';
import { formatBytes } from '../format';

const ROOTS = [
  { key: 'data', labelKey: 'plugins:details.diskData' },
  { key: 'cache', labelKey: 'plugins:details.diskCache' },
  { key: 'tmp', labelKey: 'plugins:details.diskTmp' },
] as const;

function percent(usage: DiskRootUsage): number {
  if (usage.limit <= 0) {
    return 0;
  }
  return Math.min(100, (usage.used / usage.limit) * 100);
}

interface PluginDiskUsageProps {
  usage: PluginDiskUsageType | undefined;
}

export function PluginDiskUsage({ usage }: Readonly<PluginDiskUsageProps>) {
  const { t } = useLocale();
  if (!usage) {
    return null;
  }
  return (
    <Card accent="blue" className="p-5">
      <div className="relative flex flex-col gap-4">
        <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
          <AvatarFallback className="bg-accent/10 text-accent">
            <HardDrive className="size-4" />
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-bold text-2xl tabular-nums tracking-tight">
            {formatBytes(usage.total.used)}
          </div>
          <div className="mt-1 text-muted-foreground text-sm">{t('plugins:details.diskUsage')}</div>
        </div>
        <div className="flex flex-col gap-3">
          {ROOTS.map(({ key, labelKey }) => {
            const root = usage[key];
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-muted-foreground">{t(labelKey)}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatBytes(root.used)} / {formatBytes(root.limit)}
                  </span>
                </div>
                <Progress value={percent(root)} />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
