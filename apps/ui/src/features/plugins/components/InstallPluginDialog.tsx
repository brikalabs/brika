import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@brika/clay';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { getProgressValue, useProgressStream } from '@/hooks/use-progress-stream';
import { useLocale } from '@/lib/use-locale';
import { pluginsKeys } from '../api';
import { registryApi } from '../registry-api';
import { usePluginCompileLogs } from '../use-plugin-compile';
import { InstallPluginFormFields } from './InstallPluginFormFields';
import { getPhaseLabel } from './install-progress-utils';
import { PluginProgress } from './PluginProgress';

interface InstallPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
}

export function InstallPluginDialog({
  open,
  onOpenChange,
  defaultName = '',
}: Readonly<InstallPluginDialogProps>) {
  const queryClient = useQueryClient();
  const { t } = useLocale();
  const capture = useCapture();
  const [packageName, setPackageName] = useState(defaultName);
  const [version, setVersion] = useState('');
  // The plugin's build streams as `plugin.compile` events while it loads; surface those steps as
  // lines in the install log.
  const buildLogs = usePluginCompileLogs(packageName.trim());

  // Sync packageName with defaultName whenever the dialog is (re)opened
  // for a different starter recommendation.
  useEffect(() => {
    if (open) {
      setPackageName(defaultName);
    }
  }, [open, defaultName]);

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

    capture('plugins.install_started', { versionPinned: version.trim().length > 0 });
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
            <PluginProgress
              progressValue={getProgressValue(progress?.phase)}
              phaseLabel={getPhaseLabel(progress, t)}
              logs={[...logs, ...buildLogs]}
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
