import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
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
import { type OperationProgress, registryApi, registryKeys } from '../registry-api';

export function UpdateAllButton() {
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

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const availableUpdates = data?.updates.filter((u) => u.updateAvailable) ?? [];

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
          // Invalidate queries
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
    switch (progress.phase) {
      case 'resolving':
        return 'Resolving dependencies...';
      case 'downloading':
        return 'Downloading updates...';
      case 'linking':
        return 'Linking packages...';
      case 'complete':
        return 'Update complete!';
      case 'error':
        return 'Update failed';
      default:
        return '';
    }
  };

  // Don't show button if no updates available
  if (isChecking || availableUpdates.length === 0) return null;

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
        <ArrowUp className="size-4" />
        Update {availableUpdates.length} plugin{availableUpdates.length > 1 ? 's' : ''}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-5" />
              Update Plugins
            </DialogTitle>
            <DialogDescription>
              {availableUpdates.length} plugin{availableUpdates.length > 1 ? 's have' : ' has'}{' '}
              updates available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Update list - show before updating */}
            {!isUpdating && !success && (
              <div className="space-y-2">
                {availableUpdates.map((u) => (
                  <div
                    key={u.name}
                    className="flex items-center justify-between rounded-md bg-muted/50 p-2"
                  >
                    <span className="font-mono text-sm">{u.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {u.currentVersion} → {u.latestVersion}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress section */}
            {(isUpdating || success || error) && (
              <div className="space-y-3">
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

                <ScrollArea className="h-40 rounded-md border bg-muted/30 p-3">
                  <div ref={scrollRef} className="space-y-1 font-mono text-xs">
                    {logs.map((log, i) => (
                      <div key={i} className="text-muted-foreground">
                        {log}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

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
                      Updating...
                    </>
                  ) : (
                    <>
                      <ArrowUp className="size-4" />
                      Update All
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
