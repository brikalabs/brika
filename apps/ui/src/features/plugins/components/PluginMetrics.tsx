import { Avatar, AvatarFallback, Card } from '@brika/clay';
import { MetricsChart } from '@brika/clay/components/chart';
import { Cpu, MemoryStick } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import type { PluginMetrics as PluginMetricsType } from '../api';

interface PluginMetricsProps {
  metrics: PluginMetricsType | undefined;
}

export function PluginMetrics({ metrics }: Readonly<PluginMetricsProps>) {
  const { t } = useLocale();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card accent="emerald" className="p-5">
        <div className="relative flex h-full flex-col">
          <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <Cpu className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="font-bold text-2xl tracking-tight">
            {metrics?.current?.cpu.toFixed(1) ?? '-'}%
          </div>
          <div className="mt-1 text-muted-foreground text-sm">{t('plugins:details.cpu')}</div>
          <MetricsChart
            data={
              metrics?.history?.map((h) => ({
                ts: h.ts,
                value: h.cpu,
              })) ?? []
            }
            color="oklch(0.765 0.177 163.223)"
            formatValue={(v) => `${v.toFixed(1)}%`}
            className="mt-auto pt-3"
          />
        </div>
      </Card>

      <Card accent="purple" className="p-5">
        <div className="relative flex h-full flex-col">
          <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <MemoryStick className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="font-bold text-2xl tracking-tight">
            {metrics?.current ? formatBytes(metrics.current.memory) : '-'}
          </div>
          <div className="mt-1 text-muted-foreground text-sm">{t('plugins:details.memory')}</div>
          <MetricsChart
            data={
              metrics?.history?.map((h) => ({
                ts: h.ts,
                value: h.memory,
              })) ?? []
            }
            color="oklch(0.714 0.203 305.504)"
            formatValue={formatBytes}
            className="mt-auto pt-3"
          />
        </div>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
