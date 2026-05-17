/**
 * Startup toast that surfaces an available update once per version.
 *
 * The Settings → System → Updates section is the canonical place to
 * trigger an upgrade, but users rarely visit it. This component listens
 * to the existing `useUpdateCheck` query (already wired to the hub's
 * SSE `update.available` event) and shows a one-time pill in the
 * bottom-right corner when a newer version exists.
 *
 * "Once per version" is tracked in localStorage so a dismissal sticks
 * across reloads but a *new* release resurfaces the prompt.
 */

import { Button } from '@brika/clay';
import { ArrowDownToLine, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { UpdateDialog } from './UpdateDialog';
import { useUpdateCheck } from './use-update';

const DISMISS_KEY = 'brika.update.dismissed';

function readDismissed(): string | null {
  try {
    return globalThis.localStorage?.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(version: string): void {
  try {
    globalThis.localStorage?.setItem(DISMISS_KEY, version);
  } catch {
    // Storage unavailable — fall back to in-memory only.
  }
}

export function UpdateNotification() {
  const { t } = useLocale();
  const { data } = useUpdateCheck();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => readDismissed());

  // Resync when the SSE-driven query lands a new latest version.
  useEffect(() => {
    if (!data?.updateAvailable) {
      return;
    }
    if (dismissedVersion && dismissedVersion !== data.latestVersion) {
      // New version surfaced after a previous dismissal — re-show.
      setDismissedVersion(null);
    }
  }, [data, dismissedVersion]);

  const handleDismiss = useCallback(() => {
    if (!data?.latestVersion) {
      return;
    }
    writeDismissed(data.latestVersion);
    setDismissedVersion(data.latestVersion);
  }, [data]);

  if (!data?.updateAvailable) {
    return null;
  }

  // Toast is suppressed once dismissed, but the dialog must stay mounted
  // while it's open — otherwise dismissing the toast pill behind an open
  // dialog would unmount the dialog mid-interaction.
  const showToast = dismissedVersion !== data.latestVersion;

  return (
    <>
      {showToast && (
        <output className="fade-in-50 slide-in-from-bottom-2 pointer-events-auto fixed right-4 bottom-4 z-50 flex max-w-sm animate-in flex-col gap-3 rounded-toast border border-border/60 bg-card/95 p-4 shadow-toast backdrop-blur-md duration-300">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-sm">{t('common:updates.available')}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                v{data.currentVersion} → <span className="font-mono">v{data.latestVersion}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/4 hover:text-foreground"
              aria-label={t('common:actions.close')}
            >
              <X className="size-3.5" />
            </button>
          </div>
          <Button size="sm" className="gap-1.5 self-end" onClick={() => setDialogOpen(true)}>
            <ArrowDownToLine className="size-3.5" />
            {t('common:updates.updateNow')}
          </Button>
        </output>
      )}

      <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} updateInfo={data} />
    </>
  );
}
