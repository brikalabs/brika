import { Button } from '@brika/sdk/ui-kit';
import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { FolderPlus, Upload } from '@brika/sdk/ui-kit/icons';
import { type ChangeEvent, type DragEvent, useCallback, useRef, useState } from 'react';
import { deleteEntry as deleteEntryAction, makeFolder, readEntry } from './actions';
import { Breadcrumb } from './Breadcrumb';
import { triggerDownload } from './download';
import { EntryList } from './EntryList';
import { joinPath, sortEntries } from './helpers';
import { useDirectory } from './hooks/use-directory';
import { usePreview } from './hooks/use-preview';
import { useUploads } from './hooks/use-uploads';
import { NewFolderInput } from './NewFolderInput';
import { PermissionGate } from './PermissionGate';
import { PreviewPanel } from './PreviewPanel';
import { SortMenu } from './SortMenu';
import type { FsEntry, SortKey } from './types';
import { UploadQueue } from './UploadQueue';

const ROOT_PATH = '/data';

function buildSummary(entries: FsEntry[], loading: boolean): string {
  if (loading) {
    return 'Loading…';
  }
  if (entries.length === 0) {
    return 'Empty';
  }
  const folders = entries.filter((e) => e.isDirectory).length;
  const files = entries.length - folders;
  const parts: string[] = [];
  if (folders > 0) {
    parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
  }
  if (files > 0) {
    parts.push(`${files} file${files === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function FileBrowser() {
  const callAction = useCallAction();

  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { entries, loading, permissionDenied, reload } = useDirectory(currentPath);
  const { queue, upload } = useUploads({ onAllDone: reload });
  const {
    preview,
    open: openPreview,
    close: closePreview,
    closeIfMatches,
  } = usePreview({
    currentPath,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadEntry = useCallback(
    async (entry: FsEntry) => {
      try {
        const blob = await callAction(readEntry, {
          path: joinPath(currentPath, entry.name),
        });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, entry.name);
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      } catch {
        // Toast already fired.
      }
    },
    [callAction, currentPath]
  );

  const downloadCurrentPreview = useCallback(() => {
    if (preview.kind === 'none') {
      return;
    }
    downloadEntry({
      name: preview.name,
      isFile: true,
      isDirectory: false,
      size: 0,
      mtime: 0,
    });
  }, [preview, downloadEntry]);

  const deleteEntry = useCallback(
    async (entry: FsEntry) => {
      try {
        await callAction(deleteEntryAction, { path: joinPath(currentPath, entry.name) });
        closeIfMatches(entry.name);
        await reload();
      } catch {
        // Toast already fired.
      }
    },
    [callAction, currentPath, closeIfMatches, reload]
  );

  const createFolder = useCallback(
    async (name: string) => {
      setCreatingFolder(true);
      try {
        await callAction(makeFolder, { path: joinPath(currentPath, name) });
        setNewFolderMode(false);
        await reload();
      } catch {
        // Toast already fired.
      } finally {
        setCreatingFolder(false);
      }
    },
    [callAction, currentPath, reload]
  );

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      upload(e.dataTransfer.files, currentPath);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      upload(e.target.files, currentPath);
      e.target.value = '';
    }
  }

  if (permissionDenied) {
    return <PermissionGate />;
  }

  const sortedEntries = sortEntries(entries, sortKey);
  const summary = buildSummary(sortedEntries, loading);
  const showPreview = preview.kind !== 'none';

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: breadcrumb + count on the left, actions on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-border/70 border-b pb-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <Breadcrumb path={currentPath} onNavigate={setCurrentPath} />
          <span
            className="shrink-0 font-mono text-[10px] text-muted-foreground/80 uppercase tracking-[0.12em]"
            aria-live="polite"
          >
            {summary}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SortMenu value={sortKey} onChange={setSortKey} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNewFolderMode(true)}
            disabled={newFolderMode}
            className="gap-1.5"
          >
            <FolderPlus className="size-3.5" />
            <span className="hidden sm:inline">New folder</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleFileInputChange}
          />
        </div>
      </div>

      {/*
        Main surface: a CSS grid that smoothly resizes the list column
        and reveals a 320px preview rail. Using grid (not flex) lets
        the list compute width against a known column track, which
        eliminates the overlap the older flex layout suffered from.
      */}
      <div
        className={`grid items-start gap-4 transition-[grid-template-columns] duration-300 ${
          showPreview ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'
        }`}
      >
        <section
          className={`relative min-w-0 overflow-hidden rounded-lg border bg-card transition-colors ${
            dragOver ? 'border-primary ring-2 ring-primary/30' : 'border-border'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {newFolderMode && (
            <div className="border-border/70 border-b">
              <NewFolderInput
                creating={creatingFolder}
                onSubmit={createFolder}
                onCancel={() => setNewFolderMode(false)}
              />
            </div>
          )}
          <EntryList
            entries={sortedEntries}
            loading={loading}
            dragOver={dragOver}
            onNavigate={(name) => setCurrentPath(joinPath(currentPath, name))}
            onPreview={openPreview}
            onDownload={downloadEntry}
            onDelete={deleteEntry}
          />
        </section>

        {showPreview && (
          <aside className="lg:sticky lg:top-4">
            <PreviewPanel
              preview={preview}
              onClose={closePreview}
              onDownload={downloadCurrentPreview}
            />
          </aside>
        )}
      </div>

      <UploadQueue items={queue} />
    </div>
  );
}
