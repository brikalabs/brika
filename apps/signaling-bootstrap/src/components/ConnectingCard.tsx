import { Spinner } from '@brika/clay';
import type React from 'react';

interface ConnectingCardProps {
  readonly status: string;
}

/**
 * Sparse status line shown under the animated mark while WebRTC sets up.
 * The mark carries the "loading" intent; this just narrates which step
 * we're on. Clay's `<Spinner>` adds an inline visual beat so the user
 * sees motion even if the mark's shimmer is past their peripheral vision.
 */
export function ConnectingCard({ status }: ConnectingCardProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-foreground">
      <Spinner size="sm" />
      <p className="font-medium text-[14px] tracking-tight">{status}</p>
    </div>
  );
}
