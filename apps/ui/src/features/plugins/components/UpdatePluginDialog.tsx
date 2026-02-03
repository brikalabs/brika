import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, Loader2, RotateCcw } from 'lucide-react';
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

type OperationMode = 'update' | 'reinstall';

interface UpdatePluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageName: string;
  currentVersion?: string;
  latestVersion?: string;
  mode: OperationMode;
}

export function UpdatePluginDialog({
  open,
  onOpenChange,
  packageName,
  currentVersion,
  latestVersion,
  mode,
}: Readonly<UpdatePluginDialogProps>) {
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
      queryClient.invalidateQueries({ queryKey: pluginsKeys.all });
    },
  });

  const handleClose = () => {
    if (isProcessing) return;
    reset();
    onOpenChange(false);
  };

  const handleUpdate = async () => {
    start();

    try {
      const stream =
        mode === 'reinstall'
          ? await registryApi.installStream(packageName, currentVersion || 'latest')
          : await registryApi.updateStream(packageName);

      stream.onProgress(handleProgress);
      await stream.onComplete();
    } catch (err) {
      stop(String(err));
    }
  };

  const getPhaseLabel = () => {
    if (!progress) return '';
    const action = mode === 'reinstall' ? 'Reinstall' : 'Update';
    switch (progress.phase) {
      case 'resolving':
        return 'Resolving dependencies...';
      case 'downloading':
        return 'Downloading packages...';
      case 'linking':
        return 'Linking packages...';
      case 'complete':
        return `${action} complete!`;
      case 'error':
        return `${action} failed`;
      default:
        return '';
    }
  };

  const title = mode === 'reinstall' ? 'Reinstall Plugin' : 'Update Plugin';
  const Icon = mode === 'reinstall' ? RotateCcw : ArrowUpCircle;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {mode === 'reinstall' ? (
              <>
                Reinstall{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs">{packageName}</code>
              </>
            ) : (
              <>
                Update{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs">{packageName}</code>
                {currentVersion && latestVersion && (
                  <span className="ml-1">
                    from v{currentVersion} to v{latestVersion}
                  </span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plugin info - hide when updating */}
          {!isProcessing && !success && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">Package</div>
                <code className="font-mono text-sm">{packageName}</code>
              </div>
              {currentVersion && latestVersion && (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">Version</div>
                  <div className="font-mono text-sm">
                    v{currentVersion} → v{latestVersion}
                  </div>
                </div>
              )}
              {currentVersion && !latestVersion && (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">Current Version</div>
                  <code className="font-mono text-sm">v{currentVersion}</code>
                </div>
              )}
            </div>
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
              <Button onClick={handleUpdate} disabled={isProcessing} className="gap-2">
                {isProcessing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {mode === 'reinstall' ? 'Reinstalling...' : 'Updating...'}
                  </>
                ) : (
                  <>
                    <Icon className="size-4" />
                    {mode === 'reinstall' ? 'Reinstall' : 'Update'}
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
