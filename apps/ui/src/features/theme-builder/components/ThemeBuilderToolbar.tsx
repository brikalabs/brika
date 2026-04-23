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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('themeBuilder');
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
          <Check className="size-3" /> {t('toolbar.status.saved')}
        </Badge>
      );
    }
    if (!savedId) {
      return <Badge variant="outline">{t('toolbar.status.draft')}</Badge>;
    }
    if (isDirty) {
      return (
        <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
          {t('toolbar.status.unsavedChanges')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 border-success/30 text-success">
        <Check className="size-3" /> {t('toolbar.status.saved')}
      </Badge>
    );
  };

  const idLabel = savedId
    ? savedId
        .replace(/^custom-/, '')
        .toUpperCase()
        .slice(0, 8)
    : t('toolbar.meta.draftId');
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
            <PageHeaderTitle>{draft.name || t('page.defaultName')}</PageHeaderTitle>
            {renderStatusBadge()}
            {isActive && (
              <Badge variant="default" className="gap-1">
                <Eye className="size-3" /> {t('toolbar.status.active')}
              </Badge>
            )}
          </div>
          <PageHeaderDescription>
            {draft.description || t('page.defaultDescription')}
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
                <Download /> {t('toolbar.actions.export')}{' '}
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onExport}>
                <FileJson className="size-4" />
                {t('toolbar.actions.exportJson')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportCss}>
                <FileType2 className="size-4" />
                {t('toolbar.actions.exportCss')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onCopyCss()}>
                <Clipboard className="size-4" />
                {t('toolbar.actions.copyCss')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={onApply} disabled={isDirty || !savedId}>
            <Eye /> {t('toolbar.actions.apply')}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!isDirty && Boolean(savedId)}
            title={t('toolbar.actions.saveTooltip')}
          >
            <Save /> {savedId ? t('toolbar.actions.save') : t('toolbar.actions.create')}
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Meta band — id, date, quick utilities */}
      <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
          {t('toolbar.meta.id')} · {idLabel}
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
          {t('toolbar.meta.updated')} · {dateString}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex gap-0.5 rounded-md border bg-background p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('toolbar.actions.undoTooltip')}
              aria-label={t('toolbar.actions.undo')}
              className="size-6"
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRedo}
              disabled={!canRedo}
              title={t('toolbar.actions.redoTooltip')}
              aria-label={t('toolbar.actions.redo')}
              className="size-6"
            >
              <Redo2 />
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleImportClick} className="h-7 gap-1">
            <Upload className="size-3.5" /> {t('toolbar.actions.import')}
          </Button>
          {savedId && (
            <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-7 gap-1">
              <Copy className="size-3.5" /> {t('toolbar.actions.duplicate')}
            </Button>
          )}
          {savedId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> {t('toolbar.actions.delete')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
