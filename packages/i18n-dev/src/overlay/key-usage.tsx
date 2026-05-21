import { FileCode } from 'lucide-react';
import { openInEditor } from './dom-utils';
import { useKeyUsage } from './hooks';

export function KeyUsageList({ qualifiedKey }: Readonly<{ qualifiedKey: string }>) {
  const usages = useKeyUsage(qualifiedKey);
  const plural = usages.length === 1 ? '' : 's';
  const usageLabel =
    usages.length > 0 ? `Used in ${usages.length} file${plural}` : 'Not found in source';
  return (
    <div className="mt-1 border-dt-border-dim border-t pt-1">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-dt-text-4">
        <FileCode className="size-3" />
        <span>{usageLabel}</span>
      </div>
      {usages.length > 0 && (
        <div className="space-y-px">
          {usages.map((u) => (
            <button
              key={`${u.file}:${u.line}`}
              type="button"
              onClick={() => openInEditor(`${u.file}:${u.line}`)}
              className="flex w-full cursor-pointer items-center gap-1.5 truncate rounded border-none bg-transparent px-1 py-0.5 text-left font-mono text-[10px] text-dt-text-3 transition-colors hover:bg-dt-bg-hover hover:text-indigo-400"
              title={`Open ${u.file}:${u.line} in editor`}
            >
              <span className="min-w-0 flex-1 truncate">{u.file}</span>
              <span className="shrink-0 text-dt-text-4">:{u.line}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function KeyUsageBadge({ qualifiedKey }: Readonly<{ qualifiedKey: string }>) {
  const usages = useKeyUsage(qualifiedKey);
  if (usages.length === 0) {
    return null;
  }
  return (
    <span className="rounded-full bg-indigo-500/15 px-1.5 py-px font-semibold text-[9px] text-indigo-400">
      {usages.length} ref{usages.length === 1 ? '' : 's'}
    </span>
  );
}
