import { Skeleton } from '@brika/sdk/ui-kit';
import { FolderOpen, Upload } from '@brika/sdk/ui-kit/icons';
import { EntryListHeader, EntryRow } from './EntryRow';
import type { FsEntry } from './types';

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5'] as const;

interface EntryListProps {
  entries: FsEntry[];
  loading: boolean;
  dragOver: boolean;
  onNavigate: (name: string) => void;
  onPreview: (entry: FsEntry) => void;
  onDownload: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
}

/**
 * Renders the body of the file list — loading skeletons, empty state,
 * drag overlay, or the actual rows. The parent `<section>` owns the
 * card chrome; this component fills it without nesting another card.
 */
export function EntryList({
  entries,
  loading,
  dragOver,
  onNavigate,
  onPreview,
  onDownload,
  onDelete,
}: Readonly<EntryListProps>) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1 p-3">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (dragOver) {
    return (
      <div className="pointer-events-none flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/30 ring-offset-4 ring-offset-card">
          <Upload className="size-7 animate-bounce text-primary" />
        </div>
        <p className="font-medium text-primary text-sm">Drop to upload</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <div
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full bg-muted/60"
        >
          <FolderOpen className="size-7 text-muted-foreground/80" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-sm">This folder is empty</p>
          <p className="text-muted-foreground text-xs">
            Drag files here, or use the{' '}
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Upload</span>{' '}
            button above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <EntryListHeader />
      <div className="flex flex-col">
        {entries.map((entry) => (
          <EntryRow
            key={entry.name}
            entry={entry}
            onNavigate={onNavigate}
            onPreview={onPreview}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ))}
      </div>
    </>
  );
}
