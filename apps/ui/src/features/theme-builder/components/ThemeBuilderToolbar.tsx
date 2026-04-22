/**
 * Toolbar — top row of actions on the theme builder page.
 * Save / Duplicate / Apply / Export / Import / Delete, plus a badge
 * showing which custom theme is being edited (or "Unsaved draft").
 */

import { Check, Copy, Download, Eye, Save, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import {
  Badge,
  Button,
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
  onSave: () => void;
  onDuplicate: () => void;
  onApply: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function ThemeBuilderToolbar({
  draft,
  savedId,
  isDirty,
  isActive,
  onSave,
  onDuplicate,
  onApply,
  onDelete,
  onExport,
  onImport,
}: Readonly<ThemeBuilderToolbarProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
    e.target.value = '';
  };

  const renderStatusBadge = () => {
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

  return (
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
          {draft.description || 'Edit colors, radius, and typography. Preview updates live.'}
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
        <Button variant="outline" size="sm" onClick={handleImportClick}>
          <Upload /> Import
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download /> Export
        </Button>
        {savedId && (
          <Button variant="outline" size="sm" onClick={onDuplicate}>
            <Copy /> Duplicate
          </Button>
        )}
        {savedId && (
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onApply} disabled={isDirty || !savedId}>
          <Eye /> Apply
        </Button>
        <Button size="sm" onClick={onSave} disabled={!isDirty && Boolean(savedId)}>
          <Save /> {savedId ? 'Save' : 'Create'}
        </Button>
      </PageHeaderActions>
    </PageHeader>
  );
}
