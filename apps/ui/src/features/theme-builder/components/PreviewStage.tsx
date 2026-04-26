/**
 * Preview pane shown above the per-component token editor — renders a
 * live clay preview against the current draft theme, with a light/dark
 * mode toggle. The mode is local to the detail view (the global theme
 * mode is unchanged while previewing).
 */

import { cn } from '@brika/clay';
import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeConfig } from '../types';
import { ThemedSurface } from './ThemedSurface';

export type PreviewMode = 'light' | 'dark';

interface PreviewStageProps {
  draft: ThemeConfig;
  mode: PreviewMode;
  onModeChange: (next: PreviewMode) => void;
  children: ReactNode;
}

export function PreviewStage({ draft, mode, onModeChange, children }: Readonly<PreviewStageProps>) {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="overflow-hidden rounded-container border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1">
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          {t('components.preview')}
        </span>
        <div className="flex items-center rounded-control bg-background p-0.5 shadow-xs">
          <ModeButton
            label={t('components.modeLight')}
            active={mode === 'light'}
            onClick={() => onModeChange('light')}
          >
            <Sun className="size-3" />
          </ModeButton>
          <ModeButton
            label={t('components.modeDark')}
            active={mode === 'dark'}
            onClick={() => onModeChange('dark')}
          >
            <Moon className="size-3" />
          </ModeButton>
        </div>
      </div>
      <ThemedSurface
        theme={draft}
        mode={mode}
        variant="component"
        className="flex min-h-24 items-center justify-center px-4 py-5"
      >
        {children}
      </ThemedSurface>
    </div>
  );
}

interface ModeButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ModeButton({ label, active, onClick, children }: Readonly<ModeButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex size-5 items-center justify-center rounded-control transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
