/**
 * Toolbar — two-row header for the theme builder page.
 *
 * Top row: title + status badges, plus main actions on the right.
 * Bottom row: compact meta band with theme id, last-updated date, and
 * quick utilities (Undo/Redo, Duplicate, Delete, Import, Apply).
 *
 * Splitting actions across two rows keeps the primary row focused on
 * the "save" / "export" flow while still surfacing frequent tools.
 */

import {
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Eye,
  FileJson,
  FileType2,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
} from '@/components/ui';
import type { ThemeConfig } from '../types';

interface ThemeBuilderToolbarProps {
  draft: ThemeConfig;
  savedId: string | null;
  isDirty: boolean;
  isActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  lastSavedMs: number | null;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDuplicate: () => void;
  onApply: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportCss: () => void;
  onCopyCss: () => void | Promise<void>;
  onImport: (file: File) => void;
}

function useJustSaved(lastSavedMs: number | null, windowMs = 1800): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (lastSavedMs === null) {
      setFlag(false);
      return;
    }
    setFlag(true);
    const t = globalThis.setTimeout(() => setFlag(false), windowMs);
    return () => globalThis.clearTimeout(t);
  }, [lastSavedMs, windowMs]);
  return flag;
}

export function ThemeBuilderToolbar({
  draft,
  savedId,
  isDirty,
  isActive,
  canUndo,
  canRedo,
  lastSavedMs,
  onUndo,
  onRedo,
  onSave,
  onDuplicate,
  onApply,
  onDelete,
  onExport,
  onExportCss,
  onCopyCss,
  onImport,
}: Readonly<ThemeBuilderToolbarProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const justSaved = useJustSaved(lastSavedMs);

  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
    e.target.value = '';
  };

  const renderStatusBadge = () => {
    if (justSaved) {
      return (
        <Badge variant="outline" className="gap-1 border-success/30 text-success">
          <Check className="size-3" /> Saved
        </Badge>
      );
    }
    if (!savedId) {
      return <Badge variant="outline">Draft</Badge>;
    }
    if (isDirty) {
      return (
        <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
          Unsaved changes
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 border-success/30 text-success">
        <Check className="size-3" /> Saved
      </Badge>
    );
  };

  const idLabel = savedId
    ? savedId
        .replace(/^custom-/, '')
        .toUpperCase()
        .slice(0, 8)
    : 'DRAFT';
  const dateString = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(draft.updatedAt || Date.now()));

  return (
    <div className="space-y-2">
      <PageHeader>
        <PageHeaderInfo>
          <div className="flex items-center gap-3">
            <PageHeaderTitle>{draft.name || 'Untitled theme'}</PageHeaderTitle>
            {renderStatusBadge()}
            {isActive && (
              <Badge variant="default" className="gap-1">
                <Eye className="size-3" /> Active
              </Badge>
            )}
          </div>
          <PageHeaderDescription>
            {draft.description ||
              'Edit colors, corners, radius, typography, and effects. Preview updates live.'}
          </PageHeaderDescription>
        </PageHeaderInfo>
        <PageHeaderActions>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download /> Export <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onExport}>
                <FileJson className="size-4" />
                Download JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportCss}>
                <FileType2 className="size-4" />
                Download CSS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onCopyCss()}>
                <Clipboard className="size-4" />
                Copy CSS to clipboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={onApply} disabled={isDirty || !savedId}>
            <Eye /> Apply
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!isDirty && Boolean(savedId)}
            title="Save (⌘S)"
          >
            <Save /> {savedId ? 'Save' : 'Create'}
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Meta band — id, date, quick utilities */}
      <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
          ID · {idLabel}
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
          Updated · {dateString}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex gap-0.5 rounded-md border bg-background p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
              className="size-6"
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
              className="size-6"
            >
              <Redo2 />
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleImportClick} className="h-7 gap-1">
            <Upload className="size-3.5" /> Import
          </Button>
          {savedId && (
            <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-7 gap-1">
              <Copy className="size-3.5" /> Duplicate
            </Button>
          )}
          {savedId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
