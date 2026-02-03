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
  Input,
  Label,
  ProgressDisplay,
} from '@/components/ui';
import { getProgressValue, useProgressStream } from '@/hooks/use-progress-stream';
import { pluginsKeys } from '../api';
import { registryApi } from '../registry-api';

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

  const getPhaseLabel = () => {
    if (!progress) return '';
    switch (progress.phase) {
      case 'resolving':
        return 'Resolving dependencies...';
      case 'downloading':
        return 'Downloading packages...';
      case 'linking':
        return 'Linking packages...';
      case 'complete':
        return 'Installation complete!';
      case 'error':
        return 'Installation failed';
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
            Install Plugin
          </DialogTitle>
          <DialogDescription>
            Install a plugin from the npm registry or add a local workspace plugin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input fields - hide when installing */}
          {!isProcessing && !success && (
            <>
              <div className="space-y-2">
                <Label htmlFor="package">Package Name</Label>
                <Input
                  id="package"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="@brika/plugin-timer or workspace:/path/to/plugin"
                  className="font-mono text-sm"
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Version (optional)</Label>
                <Input
                  id="version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="^1.0.0 or latest"
                  className="font-mono text-sm"
                  disabled={isProcessing}
                />
              </div>
            </>
          )}

          {/* Progress section */}
          {(isProcessing || success || error) && (
            <ProgressDisplay
              progressValue={getProgressValue(progress?.phase)}
              phaseLabel={getPhaseLabel()}
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
