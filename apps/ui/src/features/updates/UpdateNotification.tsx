/**
 * Update-available notification surfaces. Two complementary shapes:
 *
 *   <UpdateRail />  — compact card for the sidebar footer; always visible until
 *                     the user dismisses (or a newer version arrives).
 *   <UpdateToast /> — floating bottom-right card; auto-shown the first session
 *                     after a new version is detected, then collapses to the rail.
 *
 * Both share the same dismissal state (per-version, localStorage).
 */

import { Button } from '@brika/clay/components/button';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, X } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import type { HubUpdateInfo } from './api';

interface UpdateRailProps {
  readonly info: HubUpdateInfo;
  readonly onUpdate: () => void;
  readonly onViewNotes: () => void;
  readonly onDismiss: () => void;
}

export function UpdateRail({ info, onUpdate, onViewNotes, onDismiss }: Readonly<UpdateRailProps>) {
  const { t } = useLocale();

  return (
    <div className="group relative rounded-md border border-border bg-gradient-to-br from-muted/40 to-background p-2.5 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          <span className="relative size-1.5 rounded-full bg-primary" />
        </span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
          {t('common:updates.available')}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common:actions.close')}
          className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground/60 opacity-0 transition hover:text-foreground group-hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      </div>

      <div className="mt-2 inline-flex items-center gap-2 font-mono text-[12px] tabular-nums">
        <span className="text-muted-foreground">v{info.currentVersion}</span>
        <ArrowRight className="size-3 text-muted-foreground/60" />
        <span className="text-primary">v{info.latestVersion}</span>
      </div>

      <div className="mt-2.5 flex items-center gap-1">
        <Button size="sm" className="h-7 flex-1 gap-1.5 px-2 text-xs" onClick={onUpdate}>
          <ArrowDownToLine className="size-3" />
          {t('common:updates.updateNow')}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          onClick={onViewNotes}
          aria-label={t('common:updates.releaseNotes')}
        >
          <ArrowUpRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface UpdateToastProps {
  readonly info: HubUpdateInfo;
  readonly onUpdate: () => void;
  readonly onViewNotes: () => void;
  readonly onSnooze: () => void;
  readonly onDismiss: () => void;
}

export function UpdateToast({
  info,
  onUpdate,
  onViewNotes,
  onSnooze,
  onDismiss,
}: Readonly<UpdateToastProps>) {
  const { t } = useLocale();

  const teaser = extractTeaser(info.releaseNotes);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fade-in slide-in-from-bottom-4 pointer-events-auto fixed right-4 bottom-4 z-50 w-[380px] animate-in overflow-hidden rounded-md border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-md duration-300"
    >
      <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-primary/0 via-primary to-primary/0" />

      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/[0.08]">
          <ArrowDownToLine className="size-3 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-primary/80 uppercase tracking-[0.22em]">
              {t('common:updates.available')}
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t('common:actions.close')}
              className="-mt-1 -mr-1 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground/70 transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="mt-2 inline-flex items-center gap-2 font-mono text-[12px] tabular-nums">
            <span className="text-muted-foreground">v{info.currentVersion}</span>
            <ArrowRight className="size-3 text-muted-foreground/60" />
            <span className="text-primary">v{info.latestVersion}</span>
          </div>

          {teaser && (
            <p className="mt-2 line-clamp-2 text-[12.5px] text-muted-foreground leading-relaxed">
              {teaser}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-border/60 border-t bg-muted/30 px-2 py-1.5">
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onUpdate}>
          <ArrowDownToLine className="size-3.5" />
          {t('common:updates.updateNow')}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={onViewNotes}>
          {t('common:updates.releaseNotes')}
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-muted-foreground"
          onClick={onSnooze}
        >
          {t('common:updates.remindLater')}
        </Button>
      </div>
    </div>
  );
}

/** Extract a 1–2 line teaser from a markdown body — first paragraph, plain text. */
function extractTeaser(markdown: string): string {
  if (!markdown) {
    return '';
  }
  const firstPara = markdown
    .split(/\n\s*\n/)
    .find((block) => !block.startsWith('#') && block.trim().length > 0);
  if (!firstPara) {
    return '';
  }
  return firstPara
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replaceAll(/`([^`]+)`/g, '$1')
    .replaceAll(/[*_]+/g, '')
    .trim();
}
