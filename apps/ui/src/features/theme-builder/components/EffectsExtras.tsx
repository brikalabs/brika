/**
 * Extra effect controls — backdrop blur, focus ring, and motion feel.
 * Each renders a live preview using UI-kit primitives (Card, Button)
 * plus the shared FieldPreview / SliderInput / PresetChips primitives.
 */

import { Button, Card, cn, Slider, SliderValue } from '@brika/clay';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motionRecipeFor } from '../theme-css';
import { MOTION_STYLES, type MotionStyle } from '../types';
import { FieldPreview } from './FieldPreview';
import { cssVars, type Preset, PresetChips } from './primitives';

/* ─── Backdrop blur ─────────────────────────────────────────── */

interface BlurFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const BLUR_DEFS: readonly { id: string; value: number }[] = [
  { id: 'none', value: 0 },
  { id: 'subtle', value: 4 },
  { id: 'glass', value: 10 },
  { id: 'frosted', value: 20 },
  { id: 'heavy', value: 32 },
];

const BLUR_TICKS = BLUR_DEFS.map((p) => p.value);

export function BlurField({ value, onChange }: Readonly<BlurFieldProps>) {
  const { t } = useTranslation('themeBuilder');

  const presets = useMemo<Preset<number>[]>(
    () =>
      BLUR_DEFS.map((p) => ({
        value: p.value,
        label: t(`fields.effects.blur.presets.${p.id}`),
      })),
    [t]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Slider
          value={value}
          onChange={onChange}
          min={0}
          max={40}
          step={1}
          ticks={BLUR_TICKS}
          className="flex-1"
        />
        <SliderValue
          value={value}
          onChange={onChange}
          min={0}
          max={40}
          step={1}
          unit="px"
          width="w-7"
        />
      </div>
      <PresetChips presets={presets} value={value} onChange={onChange} columns="grid-cols-5" />
      <FieldPreview
        label={t('fields.effects.blur.livePreview')}
        caption={t('fields.effects.blur.caption', { value })}
      >
        <div
          className="relative h-24 w-full overflow-hidden rounded-container"
          style={{
            background:
              'linear-gradient(110deg, var(--primary), var(--accent) 35%, var(--destructive) 70%, var(--warning))',
          }}
        >
          <Card
            className="absolute inset-x-3 inset-y-3 grid place-items-center border-white/30 bg-white/25 text-[10px] text-white shadow-none dark:bg-black/25"
            style={{
              backdropFilter: `blur(${value}px) saturate(140%)`,
              WebkitBackdropFilter: `blur(${value}px) saturate(140%)`,
            }}
          >
            <span className="font-mono tracking-wider">blur({value}px)</span>
          </Card>
        </div>
      </FieldPreview>
    </div>
  );
}

/* ─── Focus ring ────────────────────────────────────────────── */

interface FocusRingFieldProps {
  width: number;
  offset: number;
  onWidthChange: (next: number) => void;
  onOffsetChange: (next: number) => void;
}

function RingSlider({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: number; onChange: (v: number) => void }>) {
  return (
    <label className="space-y-1">
      <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Slider value={value} onChange={onChange} min={0} max={6} step={0.5} className="flex-1" />
        <SliderValue
          value={value}
          onChange={onChange}
          min={0}
          max={6}
          step={0.5}
          unit="px"
          width="w-9"
        />
      </div>
    </label>
  );
}

export function FocusRingField({
  width,
  offset,
  onWidthChange,
  onOffsetChange,
}: Readonly<FocusRingFieldProps>) {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <RingSlider label={t('fields.effects.ring.width')} value={width} onChange={onWidthChange} />
        <RingSlider
          label={t('fields.effects.ring.offset')}
          value={offset}
          onChange={onOffsetChange}
        />
      </div>
      <FieldPreview
        label={t('fields.effects.ring.livePreview')}
        caption={t('fields.effects.ring.caption', { width, offset })}
      >
        <Button
          size="sm"
          tabIndex={-1}
          style={{
            outline: `${width}px solid var(--ring)`,
            outlineOffset: `${offset}px`,
          }}
        >
          {t('fields.effects.ring.focused')}
        </Button>
      </FieldPreview>
    </div>
  );
}

/* ─── Motion ────────────────────────────────────────────────── */

interface MotionFieldProps {
  value: MotionStyle;
  onChange: (next: MotionStyle) => void;
}

export function MotionField({ value, onChange }: Readonly<MotionFieldProps>) {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {MOTION_STYLES.map((style) => {
        const recipe = motionRecipeFor(style);
        const active = style === value;
        return (
          <button
            key={style}
            type="button"
            onClick={() => onChange(style)}
            className={cn(
              'group flex flex-col items-stretch gap-1.5 rounded-control border bg-card p-safe-md text-left transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
            style={cssVars({
              '--motion-duration': recipe.duration,
              '--motion-easing': recipe.easing,
            })}
          >
            <div className="relative h-5 overflow-hidden rounded-sm bg-muted/40">
              <span
                className="absolute top-1/2 left-1 block size-3 translate-x-0 -translate-y-1/2 rounded-full bg-primary transition-transform group-hover:translate-x-[calc(100%+0.25rem)]"
                style={{
                  transitionDuration: recipe.duration,
                  transitionTimingFunction: recipe.easing,
                }}
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-[11px]">{t(`fields.effects.motion.${style}`)}</span>
              <span className="font-mono text-[9px] opacity-60">{recipe.duration}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
