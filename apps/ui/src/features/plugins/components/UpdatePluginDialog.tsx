import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ProgressDisplay,
} from '@/components/ui';
import { getProgressValue, useProgressStream } from '@/hooks/use-progress-stream';
import { pluginsKeys } from '../api';
import { registryApi } from '../registry-api';
import { getPhaseLabel } from './install-progress-utils';
import { UpdatePluginDialogFooter } from './UpdatePluginDialogFooter';
import { UpdatePluginInfo } from './UpdatePluginInfo';

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

  const title = mode === 'reinstall' ? 'Reinstall Plugin' : 'Update Plugin';
  const Icon = mode === 'reinstall' ? RotateCcw : ArrowUpCircle;
  const actionLabel = mode === 'reinstall' ? 'Reinstall' : 'Update';

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
          {!isProcessing && !success && (
            <UpdatePluginInfo
              packageName={packageName}
              currentVersion={currentVersion}
              latestVersion={latestVersion}
            />
          )}

          {(isProcessing || success || error) && (
            <ProgressDisplay
              progressValue={getProgressValue(progress?.phase)}
              phaseLabel={getPhaseLabel(progress, mode)}
              logs={logs}
              scrollRef={scrollRef}
              error={error}
              success={success}
              isProcessing={isProcessing}
            />
          )}
        </div>

        <UpdatePluginDialogFooter
          success={success}
          isProcessing={isProcessing}
          actionLabel={actionLabel}
          Icon={Icon}
          onClose={handleClose}
          onAction={handleUpdate}
        />
      </DialogContent>
    </Dialog>
  );
}
