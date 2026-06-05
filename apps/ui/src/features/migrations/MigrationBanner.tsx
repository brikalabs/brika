/**
 * Migration banner — surfaces the most recent boot-time migration
 * pass. Migrations run in the hub's `onInit` *before* the HTTP server
 * is reachable, so by the time the UI mounts the work is done. This
 * banner is therefore a "what just happened" notice rather than a
 * progress indicator.
 *
 * Show conditions (any applied OR any failed). Hidden when the pass
 * was a pure noop, and dismissible per-completion (localStorage keyed
 * on `completedAt` so a *new* migration pass surfaces again even if
 * the previous one was dismissed).
 */

import { Button } from '@brika/clay/components/button';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { hasNoteworthyMigrations, migrationApi, migrationKeys } from './api';

const DISMISS_STORAGE_KEY = 'brika.migration.dismissedAt';

export function MigrationBanner() {
  const { t } = useLocale();
  const capture = useCapture();
  const { data: status } = useQuery({
    queryKey: migrationKeys.status,
    queryFn: migrationApi.status,
  });
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          setDismissedAt(parsed);
        }
      }
    } catch {
      // localStorage unavailable (private mode, SSR, …) — just don't dismiss.
    }
  }, []);

  if (!hasNoteworthyMigrations(status) || status === undefined) {
    return null;
  }
  if (status.completedAt !== null && dismissedAt === status.completedAt) {
    return null;
  }

  const applied = status.reports.reduce((sum, r) => sum + r.applied.length, 0);
  const failed = status.reports.flatMap((r) => r.failed);

  const handleDismiss = () => {
    capture('migration.dismissed', { applied, failed: failed.length });
    if (status.completedAt !== null) {
      setDismissedAt(status.completedAt);
      try {
        localStorage.setItem(DISMISS_STORAGE_KEY, String(status.completedAt));
      } catch {
        // ignore
      }
    }
  };

  return (
    <output
      className={`pointer-events-auto fixed top-3 right-3 z-50 flex items-start gap-3 rounded-lg border bg-card px-4 py-3 shadow-md ${
        failed.length > 0 ? 'border-destructive/40' : ''
      }`}
    >
      {failed.length > 0 ? (
        <AlertTriangle className="mt-0.5 size-4 text-destructive" />
      ) : (
        <Sparkles className="mt-0.5 size-4 text-primary" />
      )}
      <div className="text-sm">
        <p className="font-medium">
          {failed.length > 0
            ? t('common:updates.migrationFailedHeadline')
            : t('common:updates.migrationAppliedHeadline')}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('common:updates.migrationApplied', { count: applied })}
          {failed.length > 0
            ? ` · ${t('common:updates.migrationFailedCount', { count: failed.length })}`
            : ''}
        </p>
        {failed.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-destructive text-xs">
            {failed.map((f) => (
              <li key={f.id}>
                <span className="font-mono">{f.id}</span>: {f.error}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-mt-1 -mr-1 size-6"
        onClick={handleDismiss}
        aria-label={t('common:actions.close')}
      >
        <X className="size-3.5" />
      </Button>
    </output>
  );
}
