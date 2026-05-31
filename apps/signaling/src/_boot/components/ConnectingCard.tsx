import { Spinner } from '@brika/clay';
import type React from 'react';

export interface ConnectingProgress {
  readonly fetched: number;
  readonly total: number;
}

interface ConnectingCardProps {
  readonly status: string;
  readonly detail?: string | null;
  readonly progress?: ConnectingProgress | null;
}

/**
 * Sparse status line shown under the animated mark while WebRTC sets up.
 * The mark carries the "loading" intent; this just narrates which step
 * we're on. Clay's `<Spinner>` adds an inline visual beat so the user
 * sees motion even if the mark's shimmer is past their peripheral vision.
 *
 * `progress` (when present) renders a real determinate bar driven by
 * the BFS's fetched-vs-discovered counters. `Math.min` clamps the
 * ratio so the bar never appears to regress when the BFS uncovers
 * fresh transitive imports mid-flight and bumps `total` up faster
 * than `fetched` catches up.
 *
 * `detail` shows the technical mechanic underneath — current URL,
 * raw count — so debugging doesn't require devtools.
 */
export function ConnectingCard({
  status,
  detail,
  progress,
}: ConnectingCardProps): React.ReactElement {
  const ratio =
    progress && progress.total > 0 ? Math.min(progress.fetched / progress.total, 1) : null;
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  return (
    <div
      className="flex w-105 max-w-full flex-col items-center gap-2 text-center text-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Spinner size="sm" aria-hidden />
        <p className="font-medium text-[14px] tracking-tight">{status}</p>
      </div>
      {progress && (
        <progress
          // Native <progress> for accessibility; the appearance-none + pseudo-
          // element classes tame the OS chrome so the bar matches the rest of
          // the boot card. Tailwind's arbitrary variants reach the
          // ::-webkit-progress-bar / -value pseudos that style WebKit/Blink,
          // and `[&]:` likewise reaches the Mozilla equivalent.
          className={[
            'h-1 w-full appearance-none overflow-hidden rounded-full bg-foreground/10',
            '[&::-webkit-progress-bar]:bg-transparent',
            '[&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-foreground/60',
            '[&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-200 [&::-webkit-progress-value]:ease-out',
            '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-foreground/60',
          ].join(' ')}
          value={progress.fetched}
          max={progress.total}
          aria-label={`${pct}% — ${progress.fetched} of ${progress.total} modules loaded`}
        />
      )}
      {detail && (
        <p
          className="max-w-full truncate font-mono text-[11px] text-muted-foreground leading-snug"
          title={detail}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
