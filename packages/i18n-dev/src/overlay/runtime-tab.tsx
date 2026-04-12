import { CheckCircle2, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { RuntimeEntry } from './hooks';
import { CopyButton, EmptyState } from './primitives';

export function RuntimeContent({
  entries,
  filter,
  onClear,
}: Readonly<{
  entries: RuntimeEntry[];
  filter: string;
  onClear: () => void;
}>) {
  const filtered = useMemo(() => {
    if (!filter) {
      return entries;
    }
    const q = filter.toLowerCase();
    return entries.filter(
      (r) => r.key.toLowerCase().includes(q) || r.namespace.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={filter ? undefined : <CheckCircle2 className="size-8 text-emerald-500/60" />}
        title={filter ? 'No matching keys' : 'No missing keys detected'}
        description={
          filter
            ? undefined
            : 'Keys called via t() that have no translation will appear here in real-time.'
        }
      />
    );
  }

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] text-dt-text-3">
          {filtered.length} missing key{filtered.length === 1 ? '' : 's'} at runtime
        </span>
        <button
          type="button"
          onClick={onClear}
          className="flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 py-0.5 text-[10px] text-dt-text-3 transition-colors hover:bg-dt-bg-hover hover:text-dt-text-2"
        >
          <Trash2 className="size-3" />
          Clear
        </button>
      </div>
      {filtered.map((entry) => (
        <div
          key={`${entry.namespace}:${entry.key}`}
          className="group flex items-center gap-2 rounded-md border-l-2 border-l-red-500/50 py-1.5 pr-2 pl-3 text-[11px] transition-colors hover:bg-dt-bg-hover"
        >
          <div className="min-w-0 flex-1 truncate">
            <span className="font-mono text-red-400/80">{entry.namespace}:</span>
            <span className="font-mono text-dt-text-2">{entry.key}</span>
          </div>
          <CopyButton
            text={`${entry.namespace}:${entry.key}`}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          />
          <span className="shrink-0 rounded bg-dt-bg-badge px-1 py-px text-[9px] text-dt-text-3">
            {entry.locale}
          </span>
          {entry.count > 1 && (
            <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-px font-semibold text-[9px] text-red-400">
              {entry.count}&times;
            </span>
          )}
        </div>
      ))}
    </>
  );
}
