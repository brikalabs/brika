import { ArrowDownToLine, Download, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  Button,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
} from '@/components/ui';
import { UpdateDialog, useUpdateCheck } from '@/features/updates';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { useLocale } from '@/lib/use-locale';
import { useLastCheckedLabel } from './hooks';
import { UpdateBadge } from './UpdateBadge';

export function UpdateSection() {
  const { t } = useLocale();
  const { data, isFetching, refetch } = useUpdateCheck();
  const showLoading = useDelayedLoading(isFetching, {
    delay: 0,
    minDuration: 600,
  });
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
    <>
      <SectionHeader>
        <SectionInfo>
          <SectionIcon>
            <Download className="size-4" />
          </SectionIcon>
          <div>
            <SectionTitle>{t('settings:update.title')}</SectionTitle>
            <SectionDescription>{t('settings:update.description')}</SectionDescription>
          </div>
        </SectionInfo>
        {data && (
          <UpdateBadge
            updateAvailable={!!updateAvailable}
            devBuild={data.devBuild}
            currentVersion={data.currentVersion}
            latestVersion={data.latestVersion}
          />
        )}
      </SectionHeader>

      <SectionContent className="space-y-3">
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
      </SectionContent>
    </>
  );
}
