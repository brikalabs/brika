import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Package, XCircle } from 'lucide-react';
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
import { pluginsKeys } from '@/features/plugins/api';
import { type OperationProgress, registryApi, registryKeys } from '@/features/plugins/registry-api';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

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
  const [isInstalling, setIsInstalling] = React.useState(false);
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

  // Auto-start installation when dialog opens
  React.useEffect(() => {
    if (open && packageName && !isInstalling && !success) {
      handleInstall();
    }
  }, [open, packageName]);

  const reset = () => {
    setIsInstalling(false);
    setProgress(null);
    setLogs([]);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (isInstalling) return; // Don't close while installing
    reset();
    onOpenChange(false);
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    setSuccess(false);
    setLogs([]);

    try {
      const stream = await registryApi.installStream(packageName, version);

      stream.onProgress((p) => {
        setProgress(p);
        if (p.message) {
          setLogs((prev) => [...prev, p.message]);
        }

        if (p.phase === 'error') {
          setError(p.error || 'Installation failed');
          setIsInstalling(false);
        } else if (p.phase === 'complete') {
          setSuccess(true);
          setIsInstalling(false);
          // Invalidate queries to refresh plugin list
          queryClient.invalidateQueries({ queryKey: pluginsKeys.all });
          queryClient.invalidateQueries({ queryKey: registryKeys.packages });
          queryClient.invalidateQueries({ queryKey: ['store'] });
        }
      });

      await stream.onComplete();
    } catch (err) {
      setError(String(err));
      setIsInstalling(false);
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
    if (!progress) return t('store:install.starting');
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

        <div className="space-y-3">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{getPhaseLabel()}</span>
              {success && <CheckCircle2 className="size-4 text-emerald-500" />}
              {error && <XCircle className="size-4 text-destructive" />}
              {isInstalling && <Loader2 className="size-4 animate-spin text-primary" />}
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
              {logs.length === 0 && isInstalling && (
                <div className="text-muted-foreground">{t('store:install.initializing')}</div>
              )}
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

          {/* Success message */}
          {success && (
            <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-emerald-600 text-sm">
              {t('store:install.success')}
            </div>
          )}
        </div>

        <DialogFooter>
          {success || error ? (
            <Button onClick={handleClose}>
              {success ? t('store:actions.done') : t('store:actions.close')}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose} disabled={isInstalling}>
              {t('store:actions.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
