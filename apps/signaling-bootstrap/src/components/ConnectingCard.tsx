import type React from 'react';

interface ConnectingCardProps {
  readonly status: string;
}

/**
 * Sparse view shown while WebRTC sets up. The animated mark above it
 * carries the "loading" intent; the text just narrates which step we're on.
 */
export function ConnectingCard({ status }: ConnectingCardProps): React.ReactElement {
  return (
    <div className="text-center">
      <p className="font-medium text-[14px] tracking-tight">{status}</p>
      <p className="mt-1 min-h-[1em] font-mono text-[12px] text-muted-foreground" />
    </div>
  );
}
