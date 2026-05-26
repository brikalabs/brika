import { Button } from '@brika/sdk/ui-kit';
import { FolderPlus, Upload } from '@brika/sdk/ui-kit/icons';
import { type ChangeEvent, useRef } from 'react';
import type { SortKey } from '../types';
import { Breadcrumb } from './Breadcrumb';
import { SortMenu } from './SortMenu';

interface ToolbarProps {
  path: string;
  summary: string;
  sortKey: SortKey;
  newFolderDisabled: boolean;
  onNavigate: (path: string) => void;
  onSortChange: (key: SortKey) => void;
  onNewFolder: () => void;
  onUpload: (files: FileList) => void;
}

/**
 * Top toolbar: breadcrumb + entry-count summary on the left, sort menu +
 * "new folder" + "upload" actions on the right. The hidden file input
 * is owned here so the button's parent (`FileBrowser`) doesn't have to
 * thread a ref through.
 */
export function Toolbar({
  path,
  summary,
  sortKey,
  newFolderDisabled,
  onNavigate,
  onSortChange,
  onNewFolder,
  onUpload,
}: Readonly<ToolbarProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-border/70 border-b pb-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <Breadcrumb path={path} onNavigate={onNavigate} />
        <span
          className="shrink-0 font-mono text-[10px] text-muted-foreground/80 uppercase tracking-[0.12em]"
          aria-live="polite"
        >
          {summary}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <SortMenu value={sortKey} onChange={onSortChange} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewFolder}
          disabled={newFolderDisabled}
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
  );
}
