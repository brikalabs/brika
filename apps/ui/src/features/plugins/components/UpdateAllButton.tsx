import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Download, Loader2 } from 'lucide-react';
import React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { pluginsKeys } from '../api';
import { type OperationProgress, registryApi, registryKeys } from '../registry-api';
import { UpdateListPreview } from './UpdateListPreview';
import { UpdateProgressSection } from './UpdateProgressSection';

export function UpdateAllButton() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { data, isLoading: isChecking } = useQuery({
    queryKey: registryKeys.updates,
    queryFn: () => registryApi.checkUpdates(),
    staleTime: 5 * 60 * 1000,
  });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [progress, setProgress] = React.useState<OperationProgress | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const availableUpdates = data?.updates.filter((u) => u.updateAvailable) ?? [];

  const reset = () => {
    setIsUpdating(false);
    setProgress(null);
    setLogs([]);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (isUpdating) return;
    reset();
    setDialogOpen(false);
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);
    setSuccess(false);
    setLogs([]);

    try {
      const stream = await registryApi.updateStream();

      stream.onProgress((p) => {
        setProgress(p);
        if (p.message) {
          setLogs((prev) => [...prev, p.message]);
        }

        if (p.phase === 'error') {
          setError(p.error || 'Update failed');
          setIsUpdating(false);
        } else if (p.phase === 'complete') {
          setSuccess(true);
          setIsUpdating(false);
          queryClient.invalidateQueries({ queryKey: pluginsKeys.all });
          queryClient.invalidateQueries({ queryKey: registryKeys.updates });
        }
      });

      await stream.onComplete();
    } catch (err) {
      setError(String(err));
      setIsUpdating(false);
    }
  };

  // Don't show button if no updates available
  if (isChecking || availableUpdates.length === 0) return null;

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
        <ArrowUp className="size-4" />
        {t('plugins:update.updateCount', { count: availableUpdates.length })}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-5" />
              {t('plugins:update.title')}
            </DialogTitle>
            <DialogDescription>
              {t('plugins:update.updatesAvailable', { count: availableUpdates.length })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isUpdating && !success && <UpdateListPreview updates={availableUpdates} />}

            {(isUpdating || success || error) && (
              <UpdateProgressSection
                progress={progress}
                logs={logs}
                error={error}
                success={success}
              />
            )}
          </div>

          <DialogFooter>
            {success ? (
              <Button onClick={handleClose}>{t('plugins:update.done')}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
                  {t('common:actions.cancel')}
                </Button>
                <Button onClick={handleUpdate} disabled={isUpdating} className="gap-2">
                  {isUpdating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('plugins:update.updating')}
                    </>
                  ) : (
                    <>
                      <ArrowUp className="size-4" />
                      {t('plugins:update.updateAll')}
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
