import { ChevronRight, Download, Trash2 } from '@brika/sdk/ui-kit/icons';
import { useState } from 'react';
import { formatRelativeTime, formatSize } from '../lib/format';
import { extOf } from '../lib/path';
import type { FsEntry } from '../types';
import { DeleteConfirm } from './DeleteConfirm';
import { EntryIcon } from './EntryIcon';

interface EntryRowProps {
  entry: FsEntry;
  onNavigate: (name: string) => void;
  onPreview: (entry: FsEntry) => void;
  onDownload: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
}

export function EntryRow({
  entry,
  onNavigate,
  onPreview,
  onDownload,
  onDelete,
}: Readonly<EntryRowProps>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ext = entry.isFile ? extOf(entry.name).toUpperCase() : '';

  function handleRowClick() {
    if (entry.isDirectory) {
      onNavigate(entry.name);
    } else {
      onPreview(entry);
    }
  }

  return (
    <>
      <div className="group relative flex items-center gap-3 border-border/40 border-b px-3 py-2 transition-colors last:border-0 hover:bg-muted/40">
        {/* Left accent stripe — Linear/Stripe style, only visible on hover. */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
        />

        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          onClick={handleRowClick}
        >
          <EntryIcon entry={entry} />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-medium text-foreground text-sm">{entry.name}</span>
              {ext && (
                <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider sm:inline">
                  {ext}
                </span>
              )}
            </span>
            {entry.isDirectory && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                Folder
                <ChevronRight className="size-3" />
              </span>
            )}
          </span>
        </button>

        <span className="hidden w-20 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:block">
          {formatSize(entry.size, entry.isDirectory)}
        </span>
        <span className="hidden w-24 shrink-0 text-right text-[11px] text-muted-foreground md:block">
          {formatRelativeTime(entry.mtime)}
        </span>

        <div
          role="none"
          className="flex w-[64px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {entry.isFile && (
            <button
              type="button"
              title="Download"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => onDownload(entry)}
            >
              <Download className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Delete"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <DeleteConfirm
        entry={entry}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => onDelete(entry)}
      />
    </>
  );
}
