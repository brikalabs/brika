import { Status, StatusIndicator, StatusLabel } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';

export interface DashboardHeaderProps {
  health?: {
    ok: boolean;
  };
}

export function DashboardHeader({ health }: Readonly<DashboardHeaderProps>) {
  const { t } = useLocale();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('dashboard:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('dashboard:subtitle')}</p>
      </div>
      <Status variant={health?.ok ? 'success' : 'destructive'} className="px-3 py-1.5 text-sm">
        <StatusIndicator pulse={health?.ok === true} />
        <StatusLabel>
          {health?.ok ? t('common:status.running') : t('common:status.stopped')}
        </StatusLabel>
      </Status>
    </div>
  );
}
