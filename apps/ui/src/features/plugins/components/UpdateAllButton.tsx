import type { Plugin } from '@brika/plugin';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Loader2 } from 'lucide-react';
import React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ProgressDisplay,
} from '@/components/ui';
import { getProgressValue, useProgressStream } from '@/hooks/use-progress-stream';
import { useLocale } from '@/lib/use-locale';
import { pluginsKeys } from '../api';
import type { UpdateInfo } from '../registry-api';
import { registryApi, registryKeys } from '../registry-api';
import { getPhaseLabel } from './install-progress-utils';
import { UpdateListPreview } from './UpdateListPreview';

interface UpdateAllButtonProps {
  updates: UpdateInfo[];
  plugins: Plugin[];
}

export function UpdateAllButton({ updates, plugins }: Readonly<UpdateAllButtonProps>) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const {
    isProcessing,
    progress,
    logs,
    error,
    success,
    scrollRef,
    reset,
    handleProgress,
    start,
    stop,
  } = useProgressStream({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginsKeys.all });
      queryClient.invalidateQueries({ queryKey: registryKeys.updates });
    },
  });

  const handleClose = () => {
    if (isProcessing) return;
    reset();
    setDialogOpen(false);
  };

  const handleUpdate = async () => {
    start();
    try {
      const stream = await registryApi.updateStream();
      stream.onProgress(handleProgress);
      await stream.onComplete();
    } catch (err) {
      stop(String(err));
    }
  };

  if (updates.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
        <ArrowUp className="size-3.5" />
        {t('plugins:update.updateAll')}
        <span className="flex size-4.5 items-center justify-center rounded-full bg-blue-500 font-medium text-[10px] text-white">
          {updates.length}
        </span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('plugins:update.title')}</DialogTitle>
            <DialogDescription>
              {t('plugins:update.updatesAvailable', { count: updates.length })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isProcessing && !success && !error && (
              <UpdateListPreview updates={updates} plugins={plugins} />
            )}

            {(isProcessing || success || error) && (
              <ProgressDisplay
                progressValue={getProgressValue(progress?.phase)}
                phaseLabel={getPhaseLabel(progress, t, 'update')}
                logs={logs}
                scrollRef={scrollRef}
                error={error}
                success={success}
                isProcessing={isProcessing}
              />
            )}
          </div>

          <DialogFooter>
            {success ? (
              <Button onClick={handleClose}>{t('plugins:update.done')}</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={handleClose} disabled={isProcessing}>
                  {t('common:actions.cancel')}
                </Button>
                <Button onClick={handleUpdate} disabled={isProcessing} className="gap-2">
                  {isProcessing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('plugins:update.updating')}
                    </>
                  ) : (
                    <>
                      <ArrowUp className="size-4" />
                      {t('plugins:update.updateCount', { count: updates.length })}
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
