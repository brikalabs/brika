/**
 * Update Section Component
 *
 * Compact settings section for checking updates and reinstalling the current version.
 * Version details live in SystemInfo — this section focuses on status and actions.
 */

import {
  ArrowDownToLine,
  ArrowUpCircle,
  CheckCircle2,
  Code2,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UpdateDialog, useUpdateCheck } from '@/features/updates';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { useLocale } from '@/lib/use-locale';

function useLastCheckedLabel(timestamp: number | undefined) {
  const { t, formatRelativeTime } = useLocale();

  if (!timestamp) return t('common:updates.neverChecked');

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60)
    return t('common:updates.lastChecked', { time: t('common:time.now').toLowerCase() });

  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return t('common:updates.lastChecked', { time: formatRelativeTime(-minutes, 'minute') });

  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return t('common:updates.lastChecked', { time: formatRelativeTime(-hours, 'hour') });

  const days = Math.round(hours / 24);
  return t('common:updates.lastChecked', { time: formatRelativeTime(-days, 'day') });
}

interface UpdateBadgeProps {
  updateAvailable: boolean;
  devBuild: boolean;
  currentVersion: string;
  latestVersion: string;
}

function UpdateBadge({
  updateAvailable,
  devBuild,
  currentVersion,
  latestVersion,
}: Readonly<UpdateBadgeProps>) {
  const { t } = useLocale();
  let variant: 'default' | 'outline' | 'secondary' = 'secondary';
  if (updateAvailable) variant = 'default';
  else if (devBuild) variant = 'outline';

  if (updateAvailable) {
    return (
      <Badge variant={variant}>
        <ArrowUpCircle className="size-3" />
        {t('common:updates.versionChange', { from: currentVersion, to: latestVersion })}
      </Badge>
    );
  }
  if (devBuild) {
    return (
      <Badge variant={variant}>
        <Code2 className="size-3" />
        {t('common:updates.devBuild')}
      </Badge>
    );
  }
  return (
    <Badge variant={variant}>
      <CheckCircle2 className="size-3" />
      {t('common:updates.upToDate')}
    </Badge>
  );
}

export function UpdateSection() {
  const { t } = useLocale();
  const { data, isFetching, refetch } = useUpdateCheck();
  const showLoading = useDelayedLoading(isFetching, { delay: 0, minDuration: 600 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [forceReinstall, setForceReinstall] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | undefined>(undefined);
  const lastChecked = useLastCheckedLabel(checkedAt ?? data?.lastCheckedAt);

  const handleCheck = useCallback(async () => {
    await refetch();
    setCheckedAt(Date.now());
  }, [refetch]);

  const openDialog = (force: boolean) => {
    setForceReinstall(force);
    setDialogOpen(true);
  };

  const updateAvailable = data?.updateAvailable;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            <AvatarFallback>
              <Download className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-base">{t('settings:update.title')}</h3>
            <p className="text-muted-foreground text-sm">{t('settings:update.description')}</p>
          </div>
        </div>
        {data && (
          <UpdateBadge
            updateAvailable={!!updateAvailable}
            devBuild={data.devBuild}
            currentVersion={data.currentVersion}
            latestVersion={data.latestVersion}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCheck} disabled={showLoading}>
          <RefreshCw className={showLoading ? 'animate-spin' : ''} />
          {t('common:updates.checkNow')}
        </Button>

        {data && updateAvailable && (
          <Button size="sm" onClick={() => openDialog(false)}>
            <ArrowDownToLine />
            {t('common:updates.updateNow')}
          </Button>
        )}

        {data && !updateAvailable && (
          <Button variant="ghost" size="sm" onClick={() => openDialog(true)}>
            <ArrowDownToLine />
            {t('common:updates.reinstall')}
          </Button>
        )}

        {data && <span className="ml-auto text-muted-foreground text-xs">{lastChecked}</span>}
      </div>

      {data && (
        <UpdateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          updateInfo={data}
          force={forceReinstall}
        />
      )}
    </div>
  );
}
