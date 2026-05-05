/**
 * Release notes browser. Master-detail dialog: list of releases on the left,
 * full markdown notes on the right. Used for both:
 *
 *   - "What's new" auto-open after upgrade (passes the running version as the
 *     default selection so the just-installed release shows immediately).
 *   - Manual "Release history" trigger from Settings → Updates.
 */

import { Dialog, DialogContent } from '@brika/clay/components/dialog';
import { ScrollArea } from '@brika/clay/components/scroll-area';
import { CircleDot, ExternalLink, GitBranch, History, RefreshCw, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Markdown } from '@/features/plugins/components/Markdown';
import { useLocale } from '@/lib/use-locale';
import type { ReleaseSummary } from './api';
import { useReleases } from './use-update';

type ChannelFilter = 'all' | 'stable' | 'canary';

interface ReleaseHistoryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentVersion: string;
  /** Version to select on open. Falls back to the latest release in the list. */
  readonly defaultVersion?: string;
}

export function ReleaseHistoryDialog({
  open,
  onOpenChange,
  currentVersion,
  defaultVersion,
}: Readonly<ReleaseHistoryDialogProps>) {
  const { t } = useLocale();
  const { data, isLoading, error, refetch, isFetching } = useReleases(20);

  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const releases = useMemo(() => data?.releases ?? [], [data]);

  const visible = useMemo(
    () =>
      releases.filter((r) => {
        if (filter === 'all') {
          return true;
        }
        if (filter === 'canary') {
          return r.prerelease;
        }
        return !r.prerelease;
      }),
    [releases, filter]
  );

  // On open / when releases load, pick the default selection.
  useEffect(() => {
    if (!open || releases.length === 0) {
      return;
    }
    const preferred =
      (defaultVersion && releases.find((r) => r.version === defaultVersion)) ?? releases[0];
    if (preferred) {
      setSelected(preferred.version);
    }
  }, [open, releases, defaultVersion]);

  // If the current selection got filtered out, reselect the first visible.
  useEffect(() => {
    if (selected && visible.every((r) => r.version !== selected)) {
      setSelected(visible[0]?.version ?? null);
    }
  }, [selected, visible]);

  const activeRelease = releases.find((r) => r.version === selected) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] w-[min(1100px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-border/60 border-b bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">{t('common:updates.releaseHistory')}</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              {t('common:updates.releaseHistoryDescription', { version: currentVersion })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              aria-label={t('common:actions.refresh')}
              disabled={isFetching}
              className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('common:actions.close')}
              className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Left pane — list */}
          <aside className="flex w-[300px] shrink-0 flex-col border-border/60 border-r bg-muted/10">
            <div className="shrink-0 border-border/60 border-b px-3 py-3">
              <div className="flex items-center gap-1 rounded-sm border border-border bg-background p-0.5">
                {FILTERS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFilter(opt)}
                    className={
                      filter === opt
                        ? 'flex-1 rounded-sm bg-primary px-2.5 py-1 font-mono text-[10.5px] text-primary-foreground uppercase tracking-[0.16em] transition'
                        : 'flex-1 rounded-sm px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.16em] transition hover:text-foreground'
                    }
                  >
                    {t(`common:updates.filter.${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {isLoading && (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {t('common:updates.loadingReleases')}
                </div>
              )}
              {error && (
                <div className="px-4 py-8 text-center text-destructive text-sm">
                  {t('common:updates.releaseHistoryError')}
                </div>
              )}
              {!isLoading && !error && visible.length === 0 && (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {t('common:updates.noReleases')}
                </div>
              )}

              {visible.length > 0 && (
                <ul className="divide-y divide-border/40">
                  {visible.map((release) => (
                    <ReleaseRow
                      key={release.version}
                      release={release}
                      isCurrent={release.version === currentVersion}
                      isSelected={release.version === selected}
                      onSelect={() => setSelected(release.version)}
                    />
                  ))}
                </ul>
              )}
            </ScrollArea>
          </aside>

          {/* Right pane — content */}
          <section className="flex min-w-0 flex-1 flex-col">
            {activeRelease ? (
              <ReleaseDetail
                release={activeRelease}
                isCurrent={activeRelease.version === currentVersion}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
                {isLoading ? t('common:updates.loadingReleases') : t('common:updates.noReleases')}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FILTERS: ReadonlyArray<ChannelFilter> = ['all', 'stable', 'canary'];

interface ReleaseRowProps {
  readonly release: ReleaseSummary;
  readonly isCurrent: boolean;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

function ReleaseRow({ release, isCurrent, isSelected, onSelect }: Readonly<ReleaseRowProps>) {
  const { t } = useLocale();
  const formattedDate = new Date(release.publishedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={
          isSelected
            ? 'relative flex w-full flex-col gap-1.5 border-primary border-l-2 bg-primary/[0.06] px-4 py-3 text-left'
            : 'relative flex w-full flex-col gap-1.5 border-transparent border-l-2 px-4 py-3 text-left transition hover:bg-muted/40'
        }
      >
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[14px] text-foreground tabular-nums">
            v{release.version}
          </span>
          {isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/[0.08] px-1.5 py-0.5 font-mono text-[9.5px] text-primary uppercase tracking-[0.18em]">
              <CircleDot className="size-2" />
              {t('common:updates.installed')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
          <span className="tabular-nums">{formattedDate}</span>
          <span className="text-muted-foreground/50">·</span>
          <ChannelTag prerelease={release.prerelease} />
        </div>
      </button>
    </li>
  );
}

interface ReleaseDetailProps {
  readonly release: ReleaseSummary;
  readonly isCurrent: boolean;
}

function ReleaseDetail({ release, isCurrent }: Readonly<ReleaseDetailProps>) {
  const { t } = useLocale();
  const formattedDate = new Date(release.publishedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <header className="relative shrink-0 overflow-hidden border-border/60 border-b">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(var(--primary-soft, rgba(120,180,80,0.06)) 1px, transparent 1px), linear-gradient(90deg, var(--primary-soft, rgba(120,180,80,0.06)) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="relative px-6 pt-5 pb-5">
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <Tag className="size-4 self-center text-muted-foreground" />
              <span className="font-mono font-semibold text-[36px] text-foreground tabular-nums leading-none">
                v{release.version}
              </span>
              <ChannelTag prerelease={release.prerelease} />
              {isCurrent && (
                <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-primary uppercase tracking-[0.18em]">
                  <CircleDot className="size-2.5" />
                  {t('common:updates.installed')}
                </span>
              )}
            </div>
            {release.releaseUrl && (
              <a
                href={release.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
              >
                {t('common:updates.viewRelease')}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <div className="mt-2 flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
            <span className="tabular-nums">{formattedDate}</span>
            {release.releaseCommit && (
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="size-3" />
                {release.releaseCommit.slice(0, 7)}
              </span>
            )}
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-5">
          {release.releaseNotes ? (
            <Markdown>{release.releaseNotes}</Markdown>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              {t('common:updates.noReleaseNotes')}
            </p>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

interface ChannelTagProps {
  readonly prerelease: boolean;
}

function ChannelTag({ prerelease }: Readonly<ChannelTagProps>) {
  if (prerelease) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/30 bg-amber-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-amber-600 uppercase tracking-[0.18em] dark:text-amber-300/90">
        <span className="size-1 rounded-full bg-amber-500" />
        canary
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
      <span className="size-1 rounded-full bg-muted-foreground/70" />
      stable
    </span>
  );
}
