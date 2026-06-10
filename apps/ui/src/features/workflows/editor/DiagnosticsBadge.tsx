import { cn } from '@brika/clay';
import { Panel } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import type { GraphDiagnostic } from './graph-diagnostics';

interface DiagnosticsBadgeProps {
  diagnostics: ReadonlyArray<GraphDiagnostic>;
  onJump: (nodeId: string) => void;
}

/**
 * Canvas problems chip: errors/warnings the engine would hit at runtime
 * (stale type mismatches, missing required config, removed block types,
 * feedback loops). Click an entry to jump to the offending node.
 */
export function DiagnosticsBadge({ diagnostics, onJump }: Readonly<DiagnosticsBadgeProps>) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  if (diagnostics.length === 0) {
    return null;
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;

  return (
    <Panel position="top-center">
      <div className="flex max-w-130 flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-xs shadow-md backdrop-blur transition-colors',
            errors > 0
              ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
              : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'
          )}
        >
          <AlertTriangle className="size-3.5" />
          {errors > 0 && `${errors} ${t('workflows:editor.diagnostics.errors')}`}
          {errors > 0 && warnings > 0 && ' · '}
          {warnings > 0 && `${warnings} ${t('workflows:editor.diagnostics.warnings')}`}
        </button>
        {open && (
          <div className="max-h-60 w-130 overflow-y-auto rounded-lg border bg-popover/95 p-1 shadow-xl backdrop-blur">
            {diagnostics.map((d) => (
              <button
                key={`${d.kind}:${d.nodeId}:${d.edgeId ?? ''}:${d.message}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onJump(d.nodeId);
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                <AlertTriangle
                  className={cn(
                    'mt-0.5 size-3 shrink-0',
                    d.severity === 'error' ? 'text-destructive' : 'text-warning'
                  )}
                />
                <span className="min-w-0 break-words">{d.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
