import { useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Package } from 'lucide-react';
import { useState } from 'react';
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
import { registryApi } from '../registry-api';
import { InstallPluginFormFields } from './InstallPluginFormFields';
import { getPhaseLabel } from './install-progress-utils';

interface InstallPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstallPluginDialog({ open, onOpenChange }: Readonly<InstallPluginDialogProps>) {
  const queryClient = useQueryClient();
  const { t } = useLocale();
  const [packageName, setPackageName] = useState('');
  const [version, setVersion] = useState('');

  const {
    isProcessing,
    progress,
    logs,
    error,
    success,
    scrollRef,
    reset: resetProgress,
    handleProgress,
    start,
    stop,
  } = useProgressStream({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pluginsKeys.all,
      });
    },
  });

  const reset = () => {
    setPackageName('');
    setVersion('');
    resetProgress();
  };

  const handleClose = () => {
    if (isProcessing) {
      return;
    }
    reset();
    onOpenChange(false);
  };

  const handleInstall = async () => {
    if (!packageName.trim()) {
      return;
    }

    start();

    try {
      const stream = await registryApi.installStream(
        packageName.trim(),
        version.trim() || undefined
      );
      stream.onProgress(handleProgress);
      await stream.onComplete();
    } catch (err) {
      stop(String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" />
            {t('plugins:install.title')}
          </DialogTitle>
          <DialogDescription>{t('plugins:install.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isProcessing && !success && (
            <InstallPluginFormFields
              packageName={packageName}
              version={version}
              onPackageNameChange={setPackageName}
              onVersionChange={setVersion}
              disabled={isProcessing}
            />
          )}

          {(isProcessing || success || error) && (
            <ProgressDisplay
              progressValue={getProgressValue(progress?.phase)}
              phaseLabel={getPhaseLabel(progress, t)}
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
            <Button onClick={handleClose}>{t('plugins:install.done')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                {t('common:actions.cancel')}
              </Button>
              <Button
                onClick={handleInstall}
                disabled={isProcessing || !packageName.trim()}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('plugins:install.installing')}
                  </>
                ) : (
                  <>
                    <Download className="size-4" />
                    {t('store:actions.install')}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
