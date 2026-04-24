/**
 * ThemeBuilderPage — the "/settings/themes" screen.
 *
 * Layout:
 *   [ ThemeList ] │ [ ControlsPanel ] │ [ PreviewCanvas ]
 *
 * All state, persistence, and action handlers live in `useThemeBuilder`.
 * This component is pure layout wiring.
 *
 * Keyboard:
 *   Cmd/Ctrl+Z       Undo
 *   Cmd/Ctrl+Shift+Z Redo
 *   Cmd/Ctrl+S       Save
 */

import { Card } from '@/components/ui';
import { ControlsPanel } from './components/ControlsPanel';
import { PresetPicker } from './components/PresetPicker';
import { PreviewCanvas } from './components/PreviewCanvas';
import { ThemeBuilderToolbar } from './components/ThemeBuilderToolbar';
import { ThemeList } from './components/ThemeList';
import { useThemeBuilder } from './use-theme-builder';

export function ThemeBuilderPage() {
  const tb = useThemeBuilder();

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col gap-4">
      <ThemeBuilderToolbar
        draft={tb.draft}
        savedId={tb.savedId}
        isDirty={tb.isDirty}
        isActive={tb.isActive}
        canUndo={tb.canUndo}
        canRedo={tb.canRedo}
        lastSavedMs={tb.lastSavedMs}
        onUndo={tb.undo}
        onRedo={tb.redo}
        onSave={tb.handleSave}
        onDuplicate={tb.handleDuplicate}
        onApply={tb.handleApply}
        onDelete={tb.handleDelete}
        onExport={tb.handleExport}
        onExportCss={tb.handleExportCss}
        onCopyCss={tb.handleCopyCss}
        onImport={tb.handleImport}
      />

      <Card className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden p-0 shadow-surface">
        <ThemeList
          themes={tb.themes}
          editingId={tb.savedId}
          activeThemeName={tb.activeThemeName}
          onSelect={tb.handleSelect}
          onNew={tb.handleNew}
          presetTrigger={<PresetPicker onPick={tb.handlePickPreset} />}
        />
        <div className="w-96 shrink-0 border-r">
          <ControlsPanel draft={tb.draft} onChange={tb.handleChange} />
        </div>
        <div className="min-w-0 flex-1">
          <PreviewCanvas theme={tb.draft} />
        </div>
      </Card>
    </div>
  );
}
