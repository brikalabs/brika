import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

export interface DashboardHeaderProps {
  health?: { ok: boolean };
}

export function DashboardHeader({ health }: Readonly<DashboardHeaderProps>) {
  const { t } = useLocale();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('dashboard:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('dashboard:subtitle')}</p>
      </div>
      <Badge
        variant={health?.ok ? 'default' : 'destructive'}
        className={cn(
          'gap-2 px-3 py-1.5 text-sm',
          health?.ok && 'border-success/20 bg-success/10 text-success'
        )}
      >
        <Activity className={cn('size-4', health?.ok && 'animate-pulse')} />
        {health?.ok ? t('common:status.running') : t('common:status.stopped')}
      </Badge>
    </div>
  );
}
