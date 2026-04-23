/**
 * ThemeBuilderPage — the "/settings/themes" screen.
 *
 * Layout:
 *   [ ThemeList ] │ [ ControlsPanel ] │ [ PreviewCanvas ]
 *
 * The page holds a single `draft` managed by a small undo/redo history.
 * Every edit mutates the draft and the preview re-renders immediately
 * via inlined CSS variables. Saving writes to localStorage, Apply
 * switches the active theme to this one, Export/Import move themes as
 * JSON files (or CSS for download).
 *
 * Keyboard:
 *   Cmd/Ctrl+Z       Undo
 *   Cmd/Ctrl+Shift+Z Redo
 *   Cmd/Ctrl+S       Save
 */

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-context';
import { ControlsPanel } from './components/ControlsPanel';
import { PresetPicker } from './components/PresetPicker';
import { PreviewCanvas } from './components/PreviewCanvas';
import { ThemeBuilderToolbar } from './components/ThemeBuilderToolbar';
import { ThemeList } from './components/ThemeList';
import { useCustomThemes } from './hooks';
import {
  copyThemeCssToClipboard,
  exportThemeAsCss,
  exportThemeToFile,
  importThemeFromFile,
} from './import-export';
import { createThemeFromPreset, type ThemePreset } from './presets';
import { customThemeSelector } from './runtime';
import { customThemeStorage } from './storage';
import { createDefaultThemeConfig } from './tokens';
import type { ThemeConfig } from './types';
import { useHistory } from './use-history';

function isEqualTheme(a: ThemeConfig, b: ThemeConfig): boolean {
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function ThemeBuilderPage() {
  const themes = useCustomThemes();
  const { theme: activeThemeName, setTheme } = useTheme();

  const initialDraft = (): ThemeConfig => {
    if (activeThemeName.startsWith('custom-')) {
      const id = activeThemeName.slice('custom-'.length);
      const found = customThemeStorage.get(id);
      if (found) {
        return found;
      }
    }
    return createDefaultThemeConfig();
  };

  const history = useHistory<ThemeConfig>(initialDraft());
  const draft = history.value;

  const [savedId, setSavedId] = useState<string | null>(() => {
    if (activeThemeName.startsWith('custom-')) {
      const id = activeThemeName.slice('custom-'.length);
      return customThemeStorage.get(id) ? id : null;
    }
    return null;
  });
  const [lastSavedMs, setLastSavedMs] = useState<number | null>(null);

  const savedVersion = savedId ? themes.find((t) => t.id === savedId) : undefined;
  const isDirty = savedVersion ? !isEqualTheme(savedVersion, draft) : true;
  const isActive = savedId !== null && activeThemeName === customThemeSelector(savedId);

  const handleSave = useCallback(() => {
    customThemeStorage.save(draft);
    setSavedId(draft.id);
    setLastSavedMs(Date.now());
  }, [draft]);

  // If the saved version is externally updated (another tab), surface it.
  useEffect(() => {
    if (savedId && savedVersion && !isDirty) {
      history.replace(savedVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion?.updatedAt]);

  // Keyboard shortcuts — Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        return;
      }
      // Always allow Cmd+S even when focused in an input.
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty) {
          handleSave();
        }
        return;
      }
      // Don't hijack undo when the user is editing text.
      if (isEditableTarget(e.target)) {
        return;
      }
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [handleSave, history, isDirty]);

  const handleDuplicate = () => {
    const now = Date.now();
    const copy: ThemeConfig = {
      ...draft,
      id: `custom-${now.toString(36)}`,
      name: `${draft.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    customThemeStorage.save(copy);
    history.reset(copy);
    setSavedId(copy.id);
    setLastSavedMs(now);
  };

  const handleNew = () => {
    history.reset(createDefaultThemeConfig());
    setSavedId(null);
    setLastSavedMs(null);
  };

  const handlePickPreset = (preset: ThemePreset) => {
    history.reset(createThemeFromPreset(preset));
    setSavedId(null);
    setLastSavedMs(null);
  };

  const handleSelect = (theme: ThemeConfig) => {
    history.reset(theme);
    setSavedId(theme.id);
    setLastSavedMs(null);
  };

  const handleDelete = () => {
    if (!savedId) {
      return;
    }
    if (!confirm(`Delete theme "${draft.name}"? This cannot be undone.`)) {
      return;
    }
    customThemeStorage.remove(savedId);
    if (activeThemeName === customThemeSelector(savedId)) {
      setTheme('default');
    }
    handleNew();
  };

  const handleApply = () => {
    if (!savedId) {
      return;
    }
    setTheme(customThemeSelector(savedId));
  };

  const handleExport = () => exportThemeToFile(draft);
  const handleExportCss = () => exportThemeAsCss(draft);
  const handleCopyCss = async () => {
    try {
      await copyThemeCssToClipboard(draft);
    } catch {
      alert('Could not copy CSS to clipboard.');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importThemeFromFile(file);
      customThemeStorage.save(imported);
      history.reset(imported);
      setSavedId(imported.id);
      setLastSavedMs(Date.now());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import theme');
    }
  };

  const handleChange = (next: ThemeConfig) => history.set(next);

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col gap-4">
      <ThemeBuilderToolbar
        draft={draft}
        savedId={savedId}
        isDirty={isDirty}
        isActive={isActive}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        lastSavedMs={lastSavedMs}
        onUndo={history.undo}
        onRedo={history.redo}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onApply={handleApply}
        onDelete={handleDelete}
        onExport={handleExport}
        onExportCss={handleExportCss}
        onCopyCss={handleCopyCss}
        onImport={handleImport}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
        <ThemeList
          themes={themes}
          editingId={savedId}
          activeThemeName={activeThemeName}
          onSelect={handleSelect}
          onNew={handleNew}
          presetTrigger={<PresetPicker onPick={handlePickPreset} />}
        />
        <div className="w-96 shrink-0 border-r">
          <ControlsPanel draft={draft} onChange={handleChange} />
        </div>
        <div className="min-w-0 flex-1">
          <PreviewCanvas theme={draft} />
        </div>
      </div>
    </div>
  );
}
