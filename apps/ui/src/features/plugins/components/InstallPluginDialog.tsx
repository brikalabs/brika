import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2, Package, XCircle } from 'lucide-react';
import React from 'react';
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
  Progress,
  ScrollArea,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { pluginsKeys } from '../api';
import { type OperationProgress, registryApi } from '../registry-api';

interface InstallPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstallPluginDialog({ open, onOpenChange }: InstallPluginDialogProps) {
  const queryClient = useQueryClient();
  const [packageName, setPackageName] = React.useState('');
  const [version, setVersion] = React.useState('');
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

  const reset = () => {
    setPackageName('');
    setVersion('');
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
    if (!packageName.trim()) return;

    setIsInstalling(true);
    setError(null);
    setSuccess(false);
    setLogs([]);

    try {
      const stream = await registryApi.installStream(
        packageName.trim(),
        version.trim() || undefined
      );

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
          {!isInstalling && !success && (
            <>
              <div className="space-y-2">
                <Label htmlFor="package">Package Name</Label>
                <Input
                  id="package"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="@elia/plugin-timer or workspace:/path/to/plugin"
                  className="font-mono text-sm"
                  disabled={isInstalling}
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
                  disabled={isInstalling}
                />
              </div>
            </>
          )}

          {/* Progress section */}
          {(isInstalling || success || error) && (
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
              <Button variant="outline" onClick={handleClose} disabled={isInstalling}>
                Cancel
              </Button>
              <Button
                onClick={handleInstall}
                disabled={isInstalling || !packageName.trim()}
                className="gap-2"
              >
                {isInstalling ? (
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
