/**
 * useThemeBuilder — encapsulates all state, persistence, and action
 * handlers for the theme builder page. The page component just wires
 * the return value into its subcomponents.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
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
  const { t } = useTranslation('themeBuilder');
  const capture = useCapture();
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
    capture('theme_builder.saved', { isNew: savedId === null });
  }, [capture, draft, savedId]);

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
        capture('theme_builder.undone', { source: 'keyboard' });
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
        capture('theme_builder.redone', { source: 'keyboard' });
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [capture, handleSave, history, isDirty]);

  const handleUndo = useCallback(() => {
    history.undo();
    capture('theme_builder.undone', { source: 'toolbar' });
  }, [capture, history]);

  const handleRedo = useCallback(() => {
    history.redo();
    capture('theme_builder.redone', { source: 'toolbar' });
  }, [capture, history]);

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
    capture('theme_builder.duplicated', {});
  }, [capture, draft, history]);

  const handleNew = useCallback(() => {
    history.reset(createDefaultThemeConfig());
    setSavedId(null);
    setLastSavedMs(null);
    capture('theme_builder.new', {});
  }, [capture, history]);

  const handlePickPreset = useCallback(
    (preset: ThemePreset) => {
      history.reset(createThemeFromPreset(preset));
      setSavedId(null);
      setLastSavedMs(null);
    },
    [history]
  );

  const handleGenerate = useCallback(
    (theme: ThemeConfig) => {
      history.reset(theme);
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
      capture('theme_builder.theme_selected', {});
    },
    [capture, history]
  );

  const handleDelete = useCallback(() => {
    if (!savedId) {
      return;
    }
    if (!confirm(t('confirm.deleteTheme', { name: draft.name }))) {
      return;
    }
    capture('theme_builder.deleted', {});
    customThemeStorage.remove(savedId);
    if (activeThemeName === customThemeSelector(savedId)) {
      setTheme('brika');
    }
    handleNew();
  }, [activeThemeName, capture, draft.name, handleNew, savedId, setTheme, t]);

  const handleApply = useCallback(() => {
    if (!savedId) {
      return;
    }
    setTheme(customThemeSelector(savedId));
    capture('theme_builder.applied', {});
  }, [capture, savedId, setTheme]);

  const handleExport = useCallback(() => {
    capture('theme_builder.exported', { format: 'json' });
    exportThemeToFile(draft);
  }, [capture, draft]);
  const handleExportCss = useCallback(() => {
    capture('theme_builder.exported', { format: 'css' });
    exportThemeAsCss(draft);
  }, [capture, draft]);
  const handleCopyCss = useCallback(async () => {
    try {
      await copyThemeCssToClipboard(draft);
      capture('theme_builder.css_copied', {});
    } catch {
      alert(t('errors.copyCssFailed'));
    }
  }, [capture, draft, t]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const imported = await importThemeFromFile(file);
        customThemeStorage.save(imported);
        history.reset(imported);
        setSavedId(imported.id);
        setLastSavedMs(Date.now());
        capture('theme_builder.imported', {});
      } catch (err) {
        alert(err instanceof Error ? err.message : t('errors.importFailed'));
      }
    },
    [capture, history, t]
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
    undo: handleUndo,
    redo: handleRedo,
    handleSave,
    handleDuplicate,
    handleNew,
    handlePickPreset,
    handleGenerate,
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
