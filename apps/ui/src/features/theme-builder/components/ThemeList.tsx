/**
 * ThemeList — collapsible sidebar listing custom themes.
 *
 * Users can collapse the list into a narrow rail (~2rem) to reclaim the
 * ~13rem of horizontal space on smaller screens. Collapsed state persists
 * per session so the shape is remembered.
 */

import { Button, cn } from '@brika/clay';
import { ChevronLeft, ChevronRight, Palette, Plus } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeConfig } from '../types';

interface ThemeListProps {
  themes: ThemeConfig[];
  editingId: string | null;
  activeThemeName: string;
  onSelect: (theme: ThemeConfig) => void;
  onNew: () => void;
  presetTrigger?: ReactNode;
}

const COLLAPSED_KEY = 'brika.theme-builder.list-collapsed';

export function ThemeList({
  themes,
  editingId,
  activeThemeName,
  onSelect,
  onNew,
  presetTrigger,
}: Readonly<ThemeListProps>) {
  const { t } = useTranslation('themeBuilder');
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return globalThis.sessionStorage?.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  if (collapsed) {
    return (
      <div className="flex h-full min-h-0 w-10 shrink-0 flex-col items-center border-r bg-card">
        <div className="flex w-full shrink-0 justify-center border-b px-1 pt-safe pb-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setCollapsed(false)}
            aria-label={t('list.expandLabel')}
            title={t('list.expandTooltip')}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto p-1">
          {themes.map((t) => {
            const isEditing = editingId === t.id;
            const isActive = activeThemeName === `custom-${t.id}`;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t)}
                title={t.name}
                aria-label={t.name}
                className={cn(
                  'relative flex w-8 items-center justify-center rounded p-1 transition-colors',
                  isEditing ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <span className="flex -space-x-1">
                  {(['primary', 'accent'] as const).map((k) => (
                    <span
                      key={k}
                      className="size-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: t.colors.light[k] }}
                    />
                  ))}
                </span>
                {isActive && (
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-success ring-1 ring-card" />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex w-full shrink-0 justify-center border-t px-1 pt-1 pb-safe">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onNew}
            aria-label={t('list.newThemeLabel')}
            title={t('list.newThemeTooltip')}
          >
            <Plus />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-52 shrink-0 flex-col border-r bg-card">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b py-2 pr-2 pl-safe">
        <div className="flex items-center gap-1.5 font-medium text-sm">
          <Palette className="size-3.5" />
          {t('list.title')}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onNew}
            aria-label={t('list.newThemeLabel')}
            title={t('list.blankThemeTooltip')}
          >
            <Plus />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setCollapsed(true)}
            aria-label={t('list.collapseLabel')}
            title={t('list.collapseTooltip')}
          >
            <ChevronLeft />
          </Button>
        </div>
      </div>

      {presetTrigger && <div className="border-b p-2">{presetTrigger}</div>}

      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {themes.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {t('list.empty')}
          </div>
        ) : (
          <ol className="space-y-0.5">
            {themes.map((t, idx) => {
              const isEditing = editingId === t.id;
              const isActive = activeThemeName === `custom-${t.id}`;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t)}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      isEditing
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/60 hover:text-accent-foreground'
                    )}
                  >
                    <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex -space-x-1">
                      {(['primary', 'accent', 'success', 'destructive'] as const).map((k) => (
                        <div
                          key={k}
                          className="size-2.5 rounded-full border-2 border-card"
                          style={{ backgroundColor: t.colors.light[k] }}
                        />
                      ))}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs">{t.name}</span>
                    {isActive && <span className="size-1.5 rounded-full bg-success" />}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {themes.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t py-1.5 pr-3 pb-safe pl-safe text-[10px] text-muted-foreground">
          <span>{t('list.count', { count: themes.length })}</span>
        </div>
      )}
    </div>
  );
}
