import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  ScrollArea,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { pluginsKeys } from '../api';
import { type OperationProgress, registryApi } from '../registry-api';

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
}: UpdatePluginDialogProps) {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [progress, setProgress] = React.useState<OperationProgress | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const reset = () => {
    setIsUpdating(false);
    setProgress(null);
    setLogs([]);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (isUpdating) return; // Don't close while updating
    reset();
    onOpenChange(false);
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);
    setSuccess(false);
    setLogs([]);

    try {
      if (mode === 'reinstall') {
        // For reinstall, we use install with the same version
        const stream = await registryApi.installStream(packageName, currentVersion || 'latest');

        stream.onProgress((p) => {
          setProgress(p);
          if (p.message) {
            setLogs((prev) => [...prev, p.message]);
          }

          if (p.phase === 'error') {
            setError(p.error || 'Reinstall failed');
            setIsUpdating(false);
          } else if (p.phase === 'complete') {
            setSuccess(true);
            setIsUpdating(false);
            queryClient.invalidateQueries({ queryKey: pluginsKeys.all });
          }
        });

        await stream.onComplete();
      } else {
        // For update, we use the update endpoint
        const stream = await registryApi.updateStream(packageName);

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
          }
        });

        await stream.onComplete();
      }
    } catch (err) {
      setError(String(err));
      setIsUpdating(false);
    }
  };

  const getProgressValue = () => {
    if (!progress) return 0;
    switch (progress.phase) {
      case 'resolving':
        return 20;
      case 'downloading':
        return 50;
      case 'linking':
        return 80;
      case 'complete':
        return 100;
      default:
        return 0;
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
          {!isUpdating && !success && (
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
          {(isUpdating || success || error) && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{getPhaseLabel()}</span>
                  {success && <CheckCircle2 className="size-4 text-emerald-500" />}
                  {error && <XCircle className="size-4 text-destructive" />}
                </div>
                <Progress
                  value={getProgressValue()}
                  className={cn(
                    'h-2',
                    error && '[&>div]:bg-destructive',
                    success && '[&>div]:bg-emerald-500'
                  )}
                />
              </div>

              {/* Log output */}
              <ScrollArea className="h-40 rounded-md border bg-muted/30 p-3">
                <div ref={scrollRef} className="space-y-1 font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className="text-muted-foreground">
                      {log}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Error display */}
              {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {success ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={isUpdating} className="gap-2">
                {isUpdating ? (
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
