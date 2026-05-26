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
    downloadEntry({
      name: preview.name,
      isFile: true,
      isDirectory: false,
      size: 0,
      mtime: 0,
    });
  }, [preview, downloadEntry]);

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
        onSortChange={setSortKey}
        onNewFolder={() => setNewFolderMode(true)}
        onUpload={(files) => upload(files, currentPath)}
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
