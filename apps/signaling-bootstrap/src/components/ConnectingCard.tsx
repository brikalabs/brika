import { Spinner } from '@brika/clay';
import type React from 'react';

interface ConnectingCardProps {
  readonly status: string;
  readonly detail?: string | null;
}

/**
 * Sparse status line shown under the animated mark while WebRTC sets up.
 * The mark carries the "loading" intent; this just narrates which step
 * we're on. Clay's `<Spinner>` adds an inline visual beat so the user
 * sees motion even if the mark's shimmer is past their peripheral vision.
 *
 * The optional `detail` line surfaces the underlying mechanic — current
 * URL being fetched, module count — for debugging without forcing the
 * user to open devtools.
 */
export function ConnectingCard({ status, detail }: ConnectingCardProps): React.ReactElement {
  return (
    <div className="flex max-w-full flex-col items-center gap-1 text-center text-foreground">
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <p className="font-medium text-[14px] tracking-tight">{status}</p>
      </div>
      {detail && (
        <p
          className="max-w-105 truncate font-mono text-[11px] text-muted-foreground leading-snug"
          title={detail}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
