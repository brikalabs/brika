import { capture } from '@brika/sdk';
import { type DragEvent, useCallback, useState } from 'react';
import { EntryList } from './components/EntryList';
import { NewFolderInput } from './components/NewFolderInput';
import { PermissionGate } from './components/PermissionGate';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { Toolbar } from './components/Toolbar';
import { UploadQueue } from './components/UploadQueue';
import { useDelete } from './hooks/use-delete';
import { useDirectory } from './hooks/use-directory';
import { useFileDownload } from './hooks/use-download';
import { useFolderCreate } from './hooks/use-folder-create';
import { usePreview } from './hooks/use-preview';
import { useUploads } from './hooks/use-uploads';
import { joinPath, ROOT_PATH } from './lib/path';
import { sortEntries } from './lib/sort';
import { buildEntrySummary } from './lib/summary';
import type { FsEntry, SortKey } from './types';

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { entries, loading, permissionDenied, reload } = useDirectory(currentPath);
  const { queue, upload } = useUploads({ onAllDone: reload });
  const {
    preview,
    open: openPreview,
    close: closePreview,
    closeIfMatches,
  } = usePreview({ currentPath });

  const downloadEntry = useFileDownload(currentPath);
  const { creating: creatingFolder, create: createFolder } = useFolderCreate({
    currentPath,
    onCreated: useCallback(async () => {
      setNewFolderMode(false);
      await reload();
    }, [reload]),
  });
  const deleteEntry = useDelete({
    currentPath,
    onDeleted: useCallback(
      async (entry: FsEntry) => {
        closeIfMatches(entry.name);
        await reload();
      },
      [closeIfMatches, reload]
    ),
  });

  const downloadCurrentPreview = useCallback(() => {
    if (preview.kind === 'none') {
      return;
    }
    capture('playground.file_downloaded', { source: 'preview' });
    downloadEntry({
      name: preview.name,
      isFile: true,
      isDirectory: false,
      size: 0,
      mtime: 0,
    });
  }, [preview, downloadEntry]);

  const handleSortChange = useCallback((key: SortKey) => {
    capture('playground.files_sorted', { sortKey: key });
    setSortKey(key);
  }, []);

  const handleNavigate = useCallback(
    (name: string) => {
      capture('playground.folder_opened');
      setCurrentPath(joinPath(currentPath, name));
    },
    [currentPath]
  );

  const handlePreviewOpen = useCallback(
    (entry: FsEntry) => {
      capture('playground.file_preview_opened');
      openPreview(entry);
    },
    [openPreview]
  );

  const handleEntryDownload = useCallback(
    (entry: FsEntry) => {
      capture('playground.file_downloaded', { source: 'list' });
      downloadEntry(entry);
    },
    [downloadEntry]
  );

  const handleEntryDelete = useCallback(
    (entry: FsEntry) => {
      capture('playground.file_delete_requested', { isDirectory: entry.isDirectory });
      deleteEntry(entry);
    },
    [deleteEntry]
  );

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      capture('playground.files_uploaded', { source: 'drop', count: e.dataTransfer.files.length });
      upload(e.dataTransfer.files, currentPath);
    }
  }

  if (permissionDenied) {
    return <PermissionGate />;
  }

  const sortedEntries = sortEntries(entries, sortKey);
  const summary = buildEntrySummary(sortedEntries, loading);
  const showPreview = preview.kind !== 'none';

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        path={currentPath}
        summary={summary}
        sortKey={sortKey}
        newFolderDisabled={newFolderMode}
        onNavigate={setCurrentPath}
        onSortChange={handleSortChange}
        onNewFolder={() => {
          capture('playground.new_folder_started');
          setNewFolderMode(true);
        }}
        onUpload={(files) => {
          capture('playground.files_uploaded', { source: 'picker', count: files.length });
          upload(files, currentPath);
        }}
      />

      {/*
        Main surface: a CSS grid that smoothly resizes the list column
        and reveals a 360px preview rail. Using grid (not flex) lets
        the list compute width against a known column track, which
        eliminates the overlap the older flex layout suffered from.
      */}
      <div
        className={`grid items-start gap-4 transition-[grid-template-columns] duration-300 ${
          showPreview ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'
        }`}
      >
        <section
          // `region` + label gives the drop zone an accessible name and a
          // landmark so assistive tech can describe what the drag handlers
          // act on (drag/drop itself is inherently mouse — the Toolbar's
          // "Upload" button is the keyboard path).
          aria-label="File list and upload drop zone"
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
            onNavigate={handleNavigate}
            onPreview={handlePreviewOpen}
            onDownload={handleEntryDownload}
            onDelete={handleEntryDelete}
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
