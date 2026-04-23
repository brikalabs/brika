/**
 * useThemeBuilder — encapsulates all state, persistence, and action
 * handlers for the theme builder page. The page component just wires
 * the return value into its subcomponents.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-context';
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
import { isEqualTheme } from './theme-equality';
import { createDefaultThemeConfig } from './tokens';
import type { ThemeConfig } from './types';
import { useHistory } from './use-history';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function initialDraftFor(activeThemeName: string): ThemeConfig {
  if (activeThemeName.startsWith('custom-')) {
    const id = activeThemeName.slice('custom-'.length);
    const found = customThemeStorage.get(id);
    if (found) {
      return found;
    }
  }
  return createDefaultThemeConfig();
}

function initialSavedIdFor(activeThemeName: string): string | null {
  if (activeThemeName.startsWith('custom-')) {
    const id = activeThemeName.slice('custom-'.length);
    return customThemeStorage.get(id) ? id : null;
  }
  return null;
}

export function useThemeBuilder() {
  const themes = useCustomThemes();
  const { theme: activeThemeName, setTheme } = useTheme();

  const history = useHistory<ThemeConfig>(initialDraftFor(activeThemeName));
  const draft = history.value;

  const [savedId, setSavedId] = useState<string | null>(() => initialSavedIdFor(activeThemeName));
  const [lastSavedMs, setLastSavedMs] = useState<number | null>(null);

  const savedVersion = savedId ? themes.find((t) => t.id === savedId) : undefined;
  const isDirty = savedVersion ? !isEqualTheme(savedVersion, draft) : true;
  const isActive = savedId !== null && activeThemeName === customThemeSelector(savedId);

  const handleSave = useCallback(() => {
    customThemeStorage.save(draft);
    setSavedId(draft.id);
    setLastSavedMs(Date.now());
  }, [draft]);

  useEffect(() => {
    if (savedId && savedVersion && !isDirty) {
      history.replace(savedVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion?.updatedAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        return;
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty) {
          handleSave();
        }
        return;
      }
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

  const handleDuplicate = useCallback(() => {
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
  }, [draft, history]);

  const handleNew = useCallback(() => {
    history.reset(createDefaultThemeConfig());
    setSavedId(null);
    setLastSavedMs(null);
  }, [history]);

  const handlePickPreset = useCallback(
    (preset: ThemePreset) => {
      history.reset(createThemeFromPreset(preset));
      setSavedId(null);
      setLastSavedMs(null);
    },
    [history]
  );

  const handleSelect = useCallback(
    (theme: ThemeConfig) => {
      history.reset(theme);
      setSavedId(theme.id);
      setLastSavedMs(null);
    },
    [history]
  );

  const handleDelete = useCallback(() => {
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
  }, [activeThemeName, draft.name, handleNew, savedId, setTheme]);

  const handleApply = useCallback(() => {
    if (!savedId) {
      return;
    }
    setTheme(customThemeSelector(savedId));
  }, [savedId, setTheme]);

  const handleExport = useCallback(() => exportThemeToFile(draft), [draft]);
  const handleExportCss = useCallback(() => exportThemeAsCss(draft), [draft]);
  const handleCopyCss = useCallback(async () => {
    try {
      await copyThemeCssToClipboard(draft);
    } catch {
      alert('Could not copy CSS to clipboard.');
    }
  }, [draft]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const imported = await importThemeFromFile(file);
        customThemeStorage.save(imported);
        history.reset(imported);
        setSavedId(imported.id);
        setLastSavedMs(Date.now());
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to import theme');
      }
    },
    [history]
  );

  const handleChange = useCallback((next: ThemeConfig) => history.set(next), [history]);

  return {
    themes,
    activeThemeName,
    draft,
    savedId,
    isDirty,
    isActive,
    lastSavedMs,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,
    handleSave,
    handleDuplicate,
    handleNew,
    handlePickPreset,
    handleSelect,
    handleDelete,
    handleApply,
    handleExport,
    handleExportCss,
    handleCopyCss,
    handleImport,
    handleChange,
  };
}
