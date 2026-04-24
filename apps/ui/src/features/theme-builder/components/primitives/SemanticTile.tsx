/**
 * SemanticTile — preview tile used by Elevation/Radius/etc. fields.
 *
 * Stacks a visual sample (rendered via `visual` render-prop), a short
 * label, an optional one-line usage hint, and an optional right-side
 * "value" string (e.g. computed rem or px). Everything is centered and
 * stays aligned across tile rows.
 */

import type { ReactNode } from 'react';

interface SemanticTileProps {
  label: string;
  hint?: string;
  value?: ReactNode;
  children: ReactNode;
}

export function SemanticTile({ label, hint, value, children }: Readonly<SemanticTileProps>) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center leading-tight">
      {children}
      <div className="font-medium text-[10px] text-foreground">{label}</div>
      {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
      {value && (
        <div className="font-mono text-[9px] text-muted-foreground/70 tabular-nums">{value}</div>
      )}
    </div>
  );
}
