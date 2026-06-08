import { capture } from '@brika/sdk';
import { DropzoneDescription, DropzoneIcon, DropzoneTitle } from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { type DragEvent, useCallback, useState } from 'react';
import { DirectoryTree } from './components/DirectoryTree';
import { EntryList } from './components/EntryList';
import { NewFolderInput } from './components/NewFolderInput';
import { PermissionGate } from './components/PermissionGate';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { Toolbar } from './components/Toolbar';
import { useDelete } from './hooks/use-delete';
import { useDirTree } from './hooks/use-dir-tree';
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
  const { t } = useLocale();
  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { entries, loading, permissionDenied, reload } = useDirectory(currentPath);
  const { queue, upload } = useUploads({ onAllDone: reload });
  const { nodes, expandNode } = useDirTree();
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

  const handleTreeNavigate = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

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

  // Called by the inner Dropzone (empty-folder state) via onUpload.
  // Analytics source is 'drop' because the user dragged into the Dropzone
  // or clicked it (both resolve through Clay's Dropzone.onDrop / input).
  const handleEmptyStateUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      capture('playground.files_uploaded', { source: 'drop', count: files.length });
      upload(files, currentPath);
    },
    [upload, currentPath]
  );

  const handleToolbarUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      capture('playground.files_uploaded', { source: 'picker', count: files.length });
      upload(files, currentPath);
    },
    [upload, currentPath]
  );

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    // `dragleave` also fires when the pointer crosses into a child element, which
    // would flicker the hint off. Ignore those: only clear when the pointer
    // actually leaves the drop zone (relatedTarget is outside it, or null).
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    // The inner Clay Dropzone is rendered only when the listing is truly empty
    // (no entries, no in-flight uploads, not loading) and handles its own drop
    // via handleEmptyStateUpload. Clay's Dropzone does not stopPropagation, so
    // the event also bubbles here. Guard the section handler to fire only when
    // that inner Dropzone is absent, otherwise the drop uploads twice.
    const innerDropzoneVisible = !loading && entries.length === 0 && queue.length === 0;
    if (!innerDropzoneVisible && e.dataTransfer.files.length > 0) {
      capture('playground.files_uploaded', { source: 'drop', count: e.dataTransfer.files.length });
      upload(Array.from(e.dataTransfer.files), currentPath);
    }
  }

  if (permissionDenied) {
    return <PermissionGate />;
  }

  const sortedEntries = sortEntries(entries, sortKey);
  const summary = buildEntrySummary(sortedEntries, loading, t);
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
        onUpload={handleToolbarUpload}
      />

      {/*
        Main layout: sidebar tree (left) + content area (right). The content
        area uses a CSS grid that smoothly resizes the list column and reveals
        a 360px preview rail when a file is open.
      */}
      <div className="flex items-start gap-4">
        <DirectoryTree
          nodes={nodes}
          currentPath={currentPath}
          onNavigate={handleTreeNavigate}
          onExpand={expandNode}
        />

        <div
          className={`grid min-w-0 flex-1 items-start gap-4 transition-[grid-template-columns] duration-300 ${
            showPreview ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'
          }`}
        >
          <section
            // `region` + label gives the drop zone an accessible name and a
            // landmark so assistive tech can describe what the drag handlers
            // act on (drag/drop itself is inherently mouse - the Toolbar's
            // "Upload" button is the keyboard path).
            aria-label={t('fileBrowser.dropzone.regionLabel')}
            className={`relative min-w-0 overflow-hidden rounded-lg border bg-card transition-colors ${
              dragOver ? 'border-primary' : 'border-border'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {newFolderMode && (
              <div className="border-border/70 border-b p-3">
                <NewFolderInput
                  creating={creatingFolder}
                  onSubmit={createFolder}
                  onCancel={() => setNewFolderMode(false)}
                />
              </div>
            )}
            <EntryList
              entries={sortedEntries}
              uploads={queue}
              loading={loading}
              onNavigate={handleNavigate}
              onPreview={handlePreviewOpen}
              onDownload={handleEntryDownload}
              onDelete={handleEntryDelete}
              onUpload={handleEmptyStateUpload}
            />
            {/* Drop hint: a clean Clay dropzone surface (dashed primary frame +
                opaque scrim, no blur) overlaid while dragging. pointer-events-none
                so the drag still resolves on the section handlers underneath. */}
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-primary border-dashed bg-card/95 text-center">
                <DropzoneIcon className="text-primary" />
                <DropzoneTitle className="text-primary">
                  {t('fileBrowser.dropzone.title')}
                </DropzoneTitle>
                <DropzoneDescription>{t('fileBrowser.dropzone.hint')}</DropzoneDescription>
              </div>
            )}
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
      </div>
    </div>
  );
}
