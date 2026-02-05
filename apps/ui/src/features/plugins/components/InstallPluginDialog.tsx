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
      queryClient.invalidateQueries({ queryKey: pluginsKeys.all });
    },
  });

  const reset = () => {
    setPackageName('');
    setVersion('');
    resetProgress();
  };

  const handleClose = () => {
    if (isProcessing) return;
    reset();
    onOpenChange(false);
  };

  const handleInstall = async () => {
    if (!packageName.trim()) return;

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
            Install Plugin
          </DialogTitle>
          <DialogDescription>
            Install a plugin from the npm registry or add a local workspace plugin.
          </DialogDescription>
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
              phaseLabel={getPhaseLabel(progress)}
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
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleInstall}
                disabled={isProcessing || !packageName.trim()}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="size-4" />
                    Install
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
