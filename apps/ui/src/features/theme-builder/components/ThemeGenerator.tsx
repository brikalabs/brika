/**
 * ThemeGenerator — dialog that auto-generates a full ThemeConfig from a
 * primary color, using Clay's TOKEN_REGISTRY as the authoritative list
 * of which tokens to populate.
 *
 * Controls:
 *   • Hex color input + native color picker (primary anchor)
 *   • Style chips: balanced / vibrant / tinted
 *   • Radius preset chips
 *   • Live swatch preview of all 8 data-viz colors
 *   • Generate button → produces ThemeConfig via generateTheme()
 */

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@brika/clay';
import { Wand2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseHex } from '../color-utils';
import {
  accentSwatchesFor,
  type GenerateOptions,
  type GenerateStyle,
  generateTheme,
} from '../generate-theme';
import type { ThemeConfig } from '../types';

const STYLE_OPTIONS: { id: GenerateStyle; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Subtle tint on surfaces' },
  { id: 'vibrant', label: 'Vibrant', hint: 'Stronger hue presence' },
  { id: 'tinted', label: 'Tinted', hint: 'Full-surface color wash' },
];

const RADIUS_PRESETS = [
  { label: 'Sharp', value: 0 },
  { label: 'Subtle', value: 0.375 },
  { label: 'Default', value: 0.75 },
  { label: 'Soft', value: 1.25 },
  { label: 'Pill', value: 9999 },
];

const DEFAULT_PRIMARY = '#3b82f6';

interface SwatchStripProps {
  primary: string;
}

function SwatchStrip({ primary }: Readonly<SwatchStripProps>) {
  const swatches = useMemo(() => accentSwatchesFor(primary), [primary]);
  if (swatches.length === 0) return null;
  return (
    <div className="flex h-6 overflow-hidden rounded-control">
      {swatches.map((color) => (
        <span key={color} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

interface ColorInputProps {
  value: string;
  onChange: (hex: string) => void;
}

function ColorInput({ value, onChange }: Readonly<ColorInputProps>) {
  const [raw, setRaw] = useState(value);
  const hexOk = parseHex(value) !== null;

  const commit = useCallback(
    (v: string) => {
      if (parseHex(v) !== null) {
        onChange(v);
      }
    },
    [onChange]
  );

  return (
    <div className="flex items-center gap-2">
      <div className="relative size-8 shrink-0 overflow-hidden rounded-control border shadow-sm">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: hexOk ? value : DEFAULT_PRIMARY }}
        />
        <input
          type="color"
          value={hexOk ? value : DEFAULT_PRIMARY}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange(e.target.value);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Pick primary color"
        />
      </div>
      <Input
        value={raw}
        placeholder="#3b82f6"
        spellCheck={false}
        onChange={(e) => {
          setRaw(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setRaw(hexOk ? value : raw)}
        className="h-8 font-mono text-sm"
      />
    </div>
  );
}

interface ThemeGeneratorProps {
  onGenerate: (theme: ThemeConfig) => void;
  trigger?: React.ReactNode;
}

export function ThemeGenerator({ onGenerate, trigger }: Readonly<ThemeGeneratorProps>) {
  const { t } = useTranslation('themeBuilder');
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [style, setStyle] = useState<GenerateStyle>('balanced');
  const [radius, setRadius] = useState(0.75);
  const [name, setName] = useState('');

  const valid = parseHex(primary) !== null;

  const handleGenerate = useCallback(() => {
    if (!valid) return;
    const options: GenerateOptions = {
      primary,
      radius,
      style,
      name: name.trim() || undefined,
    };
    onGenerate(generateTheme(options));
    setOpen(false);
  }, [primary, radius, style, name, valid, onGenerate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="w-full justify-start gap-2">
            <Wand2 /> {t('generator.trigger', { defaultValue: 'Generate theme' })}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-md p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>{t('generator.title', { defaultValue: 'Generate a theme' })}</DialogTitle>
          <DialogDescription>
            {t('generator.description', {
              defaultValue:
                "Pick a primary color and a style — all tokens are derived automatically from Clay's token registry.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-5">
          {/* Primary color */}
          <div className="space-y-2">
            <Label className="font-medium text-xs">
              {t('generator.primaryLabel', { defaultValue: 'Primary color' })}
            </Label>
            <ColorInput value={primary} onChange={setPrimary} />
            {valid && <SwatchStrip primary={primary} />}
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label className="font-medium text-xs">
              {t('generator.styleLabel', { defaultValue: 'Surface tint' })}
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStyle(opt.id)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-control border px-2.5 py-2 text-left transition-colors',
                    style === opt.id
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  <span className="font-medium text-xs">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium text-xs">
                {t('generator.radiusLabel', { defaultValue: 'Corner radius' })}
              </Label>
              <span className="font-mono text-[10px] text-muted-foreground">
                {radius === 9999 ? '∞' : `${radius}rem`}
              </span>
            </div>
            <div className="flex gap-1">
              {RADIUS_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setRadius(p.value)}
                  className={cn(
                    'flex-1 rounded border py-1 text-center text-[10px] transition-colors',
                    radius === p.value
                      ? 'border-primary bg-primary/8 font-medium text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label className="font-medium text-xs">
              {t('generator.nameLabel', { defaultValue: 'Theme name' })}
            </Label>
            <Input
              value={name}
              placeholder={t('page.defaultName', { defaultValue: 'My Theme' })}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t('toolbar.actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={!valid}>
            <Wand2 />
            {t('generator.generate', { defaultValue: 'Generate' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
