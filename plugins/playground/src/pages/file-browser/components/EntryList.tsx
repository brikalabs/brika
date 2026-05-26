import { Skeleton } from '@brika/sdk/ui-kit';
import type { FsEntry } from '../types';
import { DropOverlay } from './DropOverlay';
import { EmptyState } from './EmptyState';
import { EntryListHeader } from './EntryListHeader';
import { EntryRow } from './EntryRow';

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
    return <DropOverlay />;
  }

  if (entries.length === 0) {
    return <EmptyState />;
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
