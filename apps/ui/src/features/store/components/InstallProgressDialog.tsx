import { useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useEffect } from 'react';
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
import { pluginsKeys } from '@/features/plugins/api';
import { registryApi, registryKeys } from '@/features/plugins/registry-api';
import { getProgressValue, useProgressStream } from '@/hooks/use-progress-stream';
import { useLocale } from '@/lib/use-locale';

interface InstallProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageName: string;
  version?: string;
}

export function InstallProgressDialog({
  open,
  onOpenChange,
  packageName,
  version,
}: Readonly<InstallProgressDialogProps>) {
  const { t } = useLocale();
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({
        queryKey: pluginsKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: registryKeys.packages,
      });
      queryClient.invalidateQueries({
        queryKey: [
          'store',
        ],
      });
    },
  });

  // Auto-start installation when dialog opens
  useEffect(() => {
    if (open && packageName && !isProcessing && !success) {
      handleInstall();
    }
  }, [
    open,
    packageName,
  ]);

  const handleClose = () => {
    if (isProcessing) {
      return;
    }
    reset();
    onOpenChange(false);
  };

  const handleInstall = async () => {
    start();

    try {
      const stream = await registryApi.installStream(packageName, version);
      stream.onProgress(handleProgress);
      await stream.onComplete();
    } catch (err) {
      stop(String(err));
    }
  };

  const getPhaseLabel = () => {
    if (!progress) {
      return t('store:install.starting');
    }
    switch (progress.phase) {
      case 'resolving':
        return t('store:install.resolving');
      case 'downloading':
        return t('store:install.downloading');
      case 'linking':
        return t('store:install.linking');
      case 'complete':
        return t('store:install.complete');
      case 'error':
        return t('store:install.failed');
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" />
            {t('store:install.title')}
          </DialogTitle>
          <DialogDescription className="font-mono text-sm">
            {packageName}
            {version && ` @${version}`}
          </DialogDescription>
        </DialogHeader>

        <ProgressDisplay
          progressValue={getProgressValue(progress?.phase)}
          phaseLabel={getPhaseLabel()}
          logs={logs}
          scrollRef={scrollRef}
          error={error}
          success={success}
          isProcessing={isProcessing}
          emptyLogsMessage={t('store:install.initializing')}
          successMessage={t('store:install.success')}
        />

        <DialogFooter>
          {success || error ? (
            <Button onClick={handleClose}>
              {success ? t('store:actions.done') : t('store:actions.close')}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
              {t('store:actions.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
