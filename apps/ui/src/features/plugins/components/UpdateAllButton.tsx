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
import { pluginsKeys } from '../api';
import { type OperationProgress, registryApi, registryKeys } from '../registry-api';
import { UpdateListPreview } from './UpdateListPreview';
import { UpdateProgressSection } from './UpdateProgressSection';

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
