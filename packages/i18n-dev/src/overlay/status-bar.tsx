import { KbdGroup } from './primitives';

export function StatusBar({
  errorCount,
  warnCount,
  runtimeCount,
}: Readonly<{
  errorCount: number;
  warnCount: number;
  runtimeCount: number;
}>) {
  const totalIssues = errorCount + warnCount + runtimeCount;
  return (
    <div className="flex items-center justify-between border-dt-border border-t bg-dt-bg-subtle px-3.5 py-1.5 text-[10px] text-dt-text-3">
      <span>
        {errorCount > 0 && (
          <span className="text-red-400">
            {errorCount} error{errorCount > 1 ? 's' : ''}
          </span>
        )}
        {errorCount > 0 && warnCount > 0 && <span className="text-dt-text-4"> &middot; </span>}
        {warnCount > 0 && (
          <span className="text-amber-400">
            {warnCount} warning{warnCount > 1 ? 's' : ''}
          </span>
        )}
        {(errorCount > 0 || warnCount > 0) && runtimeCount > 0 && (
          <span className="text-dt-text-4"> &middot; </span>
        )}
        {runtimeCount > 0 && <span className="text-red-400">{runtimeCount} runtime</span>}
        {totalIssues === 0 && <span className="text-emerald-400">All translations OK</span>}
      </span>
      <KbdGroup keys={['Shift', 'Alt', 'D']} />
    </div>
  );
}
