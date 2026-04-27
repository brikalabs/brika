/**
 * PresetPicker — dialog with a grid of palettes the user can seed a
 * new theme from. Each card shows a split light/dark preview plus a
 * Pantone-style swatch strip of the data palette.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@brika/clay';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_PRESETS, type ThemePreset } from '../presets';

interface PresetPickerProps {
  onPick: (preset: ThemePreset) => void;
  trigger?: React.ReactNode;
}

interface PresetCardProps {
  preset: ThemePreset;
  onPick: () => void;
}

function PresetCard({ preset, onPick }: Readonly<PresetCardProps>) {
  const { t } = useTranslation('themeBuilder');
  const { light, dark } = preset.colors;
  const description = t(`presets.items.${preset.id}.description`, {
    defaultValue: preset.description,
  });
  return (
    <button
      type="button"
      onClick={onPick}
      className="group overflow-hidden rounded-lg border bg-card text-left transition-all hover:border-primary hover:shadow-md"
    >
      {/* Split light/dark plate */}
      <div className="relative flex h-36 overflow-hidden">
        <div
          className="flex flex-1 flex-col justify-between p-3"
          style={{ backgroundColor: light.background, color: light.foreground }}
        >
          <div className="font-semibold text-sm">Aa</div>
          <div className="space-y-2">
            <div className="flex gap-1">
              <span className="h-2.5 w-6 rounded-full" style={{ backgroundColor: light.primary }} />
              <span className="h-2.5 w-4 rounded-full" style={{ backgroundColor: light.accent }} />
              <span className="h-2.5 w-3 rounded-full" style={{ backgroundColor: light.success }} />
            </div>
            <div
              className="inline-block rounded px-1.5 py-0.5 font-medium text-[9px]"
              style={{ backgroundColor: light.primary, color: light['primary-foreground'] }}
            >
              Primary
            </div>
          </div>
        </div>
        <div
          className="flex flex-1 flex-col justify-between p-3"
          style={{ backgroundColor: dark.background, color: dark.foreground }}
        >
          <div className="font-semibold text-sm">Aa</div>
          <div className="space-y-2">
            <div className="flex gap-1">
              <span className="h-2.5 w-6 rounded-full" style={{ backgroundColor: dark.primary }} />
              <span className="h-2.5 w-4 rounded-full" style={{ backgroundColor: dark.accent }} />
              <span className="h-2.5 w-3 rounded-full" style={{ backgroundColor: dark.success }} />
            </div>
            <div
              className="inline-block rounded px-1.5 py-0.5 font-medium text-[9px]"
              style={{ backgroundColor: dark.primary, color: dark['primary-foreground'] }}
            >
              Primary
            </div>
          </div>
        </div>
      </div>

      {/* Data swatch strip */}
      <div className="flex h-2">
        {(
          ['data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6', 'data-7', 'data-8'] as const
        ).map((k) => (
          <span key={k} className="flex-1" style={{ backgroundColor: light[k] }} />
        ))}
      </div>

      <div className="space-y-1 border-t p-3">
        <div className="truncate font-medium text-sm">{preset.name}</div>
        <div className="line-clamp-2 text-muted-foreground text-xs">{description}</div>
      </div>
    </button>
  );
}

export function PresetPicker({ onPick, trigger }: Readonly<PresetPickerProps>) {
  const { t } = useTranslation('themeBuilder');
  const [open, setOpen] = useState(false);

  const handlePick = (preset: ThemePreset) => {
    onPick(preset);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="w-full justify-start gap-2">
            <Sparkles /> {t('presets.trigger')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-350 flex-col overflow-hidden p-0 sm:max-w-350">
        <DialogHeader className="shrink-0 space-y-1 border-b p-5">
          <DialogTitle>{t('presets.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('presets.dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {THEME_PRESETS.map((preset) => (
              <PresetCard key={preset.id} preset={preset} onPick={() => handlePick(preset)} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
