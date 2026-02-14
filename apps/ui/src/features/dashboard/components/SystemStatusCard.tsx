import { Server } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

export interface SystemStatusCardProps {
  health?: { ok: boolean };
  runningPlugins: number;
  totalPlugins: number;
  totalSparks: number;
  totalBlocks: number;
  totalBricks: number;
}

export function SystemStatusCard({
  health,
  runningPlugins,
  totalPlugins,
  totalSparks,
  totalBlocks,
  totalBricks,
}: Readonly<SystemStatusCardProps>) {
  const { t } = useLocale();

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="size-4 text-primary" />
          {t('common:labels.status')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <span className="font-medium text-sm">{t('common:labels.status')}</span>
          <Badge
            variant={health?.ok ? 'default' : 'destructive'}
            className={cn(health?.ok && 'border-success/20 bg-success/10 text-success')}
          >
            {health?.ok ? t('common:status.running') : t('common:status.stopped')}
          </Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <span className="font-medium text-sm">{t('dashboard:stats.plugins')}</span>
          <Badge variant="secondary" className="font-semibold">
            {runningPlugins} / {totalPlugins}
          </Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <span className="font-medium text-sm">{t('sparks:title')}</span>
          <Badge variant="secondary" className="font-semibold">
            {totalSparks}
          </Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <span className="font-medium text-sm">{t('dashboard:stats.blocks')}</span>
          <Badge variant="secondary" className="font-semibold">
            {totalBlocks}
          </Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <span className="font-medium text-sm">{t('dashboard:stats.brickTypes')}</span>
          <Badge variant="secondary" className="font-semibold">
            {totalBricks}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
