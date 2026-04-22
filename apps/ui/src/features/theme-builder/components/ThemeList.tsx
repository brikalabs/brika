/**
 * ThemeList — left-most sidebar listing the user's custom themes.
 * "New theme" creates a fresh draft. Clicking an existing theme loads
 * it into the editor. The currently editing theme is highlighted.
 */

import { Palette, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ThemeConfig } from '../types';

interface ThemeListProps {
  themes: ThemeConfig[];
  editingId: string | null;
  activeThemeName: string;
  onSelect: (theme: ThemeConfig) => void;
  onNew: () => void;
}

export function ThemeList({
  themes,
  editingId,
  activeThemeName,
  onSelect,
  onNew,
}: Readonly<ThemeListProps>) {
  return (
    <div className="flex h-full min-h-0 w-56 shrink-0 flex-col border-r bg-card">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Palette className="size-4" />
          My themes
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onNew} aria-label="New theme">
          <Plus />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {themes.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            No custom themes yet. Click + to create one.
          </div>
        ) : (
          <div className="space-y-1">
            {themes.map((t) => {
              const isEditing = editingId === t.id;
              const isActive = activeThemeName === `custom-${t.id}`;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    isEditing
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60 hover:text-accent-foreground'
                  )}
                >
                  <div className="flex -space-x-1">
                    {(['primary', 'accent', 'success', 'destructive'] as const).map((k) => (
                      <div
                        key={k}
                        className="size-3 rounded-full border-2 border-card"
                        style={{ backgroundColor: t.colors.light[k] }}
                      />
                    ))}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {isActive && <span className="size-1.5 rounded-full bg-success" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
