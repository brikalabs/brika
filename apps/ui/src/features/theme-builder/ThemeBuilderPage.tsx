/**
 * ThemeBuilderPage — the "/settings/themes" screen.
 *
 * Layout:
 *   [ ThemeList ] │ [ ControlsPanel ] │ [ PreviewCanvas ]
 *
 * The page holds a single `draft` in local state. Every edit mutates
 * the draft and the preview re-renders immediately via inlined CSS
 * variables. Saving writes to localStorage, Apply switches the active
 * theme to this one, Export/Import move themes as JSON files.
 */

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-context';
import { ControlsPanel } from './components/ControlsPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { ThemeBuilderToolbar } from './components/ThemeBuilderToolbar';
import { ThemeList } from './components/ThemeList';
import { useCustomThemes } from './hooks';
import { exportThemeToFile, importThemeFromFile } from './import-export';
import { customThemeSelector } from './runtime';
import { customThemeStorage } from './storage';
import { createDefaultThemeConfig } from './tokens';
import type { ThemeConfig } from './types';

function isEqualTheme(a: ThemeConfig, b: ThemeConfig): boolean {
  // Ignore updatedAt — it drifts on save and isn't part of "content".
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}

export function ThemeBuilderPage() {
  const themes = useCustomThemes();
  const { theme: activeThemeName, setTheme } = useTheme();

  const [draft, setDraft] = useState<ThemeConfig>(() => {
    // Open the currently active custom theme if any, otherwise a fresh one.
    if (activeThemeName.startsWith('custom-')) {
      const id = activeThemeName.slice('custom-'.length);
      const found = customThemeStorage.get(id);
      if (found) {
        return found;
      }
    }
    return createDefaultThemeConfig();
  });

  const [savedId, setSavedId] = useState<string | null>(() => {
    if (activeThemeName.startsWith('custom-')) {
      const id = activeThemeName.slice('custom-'.length);
      return customThemeStorage.get(id) ? id : null;
    }
    return null;
  });

  const savedVersion = savedId ? themes.find((t) => t.id === savedId) : undefined;
  const isDirty = savedVersion ? !isEqualTheme(savedVersion, draft) : true;
  const isActive = savedId !== null && activeThemeName === customThemeSelector(savedId);

  // If the saved version is externally updated (another tab), surface it.
  useEffect(() => {
    if (savedId && savedVersion && !isDirty) {
      setDraft(savedVersion);
    }
    // Only when the saved record changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion?.updatedAt]);

  const handleSave = () => {
    customThemeStorage.save(draft);
    setSavedId(draft.id);
  };

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
    setDraft(copy);
    setSavedId(copy.id);
  };

  const handleNew = () => {
    const fresh = createDefaultThemeConfig();
    setDraft(fresh);
    setSavedId(null);
  };

  const handleSelect = (theme: ThemeConfig) => {
    setDraft(theme);
    setSavedId(theme.id);
  };

  const handleDelete = () => {
    if (!savedId) {
      return;
    }
    if (!confirm(`Delete theme "${draft.name}"? This cannot be undone.`)) {
      return;
    }
    customThemeStorage.remove(savedId);
    // If the deleted theme was active, fall back to default.
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

  const handleImport = async (file: File) => {
    try {
      const imported = await importThemeFromFile(file);
      customThemeStorage.save(imported);
      setDraft(imported);
      setSavedId(imported.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import theme');
    }
  };

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col gap-4">
      <ThemeBuilderToolbar
        draft={draft}
        savedId={savedId}
        isDirty={isDirty}
        isActive={isActive}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onApply={handleApply}
        onDelete={handleDelete}
        onExport={handleExport}
        onImport={handleImport}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
        <ThemeList
          themes={themes}
          editingId={savedId}
          activeThemeName={activeThemeName}
          onSelect={handleSelect}
          onNew={handleNew}
        />
        <div className="w-80 shrink-0 border-r">
          <ControlsPanel draft={draft} onChange={setDraft} />
        </div>
        <div className="min-w-0 flex-1">
          <PreviewCanvas theme={draft} />
        </div>
      </div>
    </div>
  );
}
