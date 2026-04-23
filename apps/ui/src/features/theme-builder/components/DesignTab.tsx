/**
 * DesignTab — icon rail + focused section.
 *
 * Instead of stacking six collapsibles, the panel shows an icon rail
 * at the top and renders one section at a time in the body below. The
 * active section persists in sessionStorage so the panel feels stable
 * across tab switches.
 */

import { Blocks, Layers, type LucideIcon, Ruler, Shapes, Type, Wind } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MONO_FONT_CHOICES, SANS_FONT_CHOICES } from '../tokens';
import type { CornerStyle, ElevationStyle, MotionStyle, ThemeConfig } from '../types';
import { ComponentsSection } from './ComponentsSection';
import { CornerField } from './CornerField';
import { BlurField, FocusRingField, MotionField } from './EffectsExtras';
import { BorderWidthField, ElevationField } from './EffectsField';
import { FontField } from './FontField';
import { TokenLabel } from './primitives';
import { RadiusField } from './RadiusField';
import { SpacingField } from './SpacingField';
import { TextSizeField } from './TextSizeField';

interface DesignTabProps {
  draft: ThemeConfig;
  patch: <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => void;
  onChange: (next: ThemeConfig) => void;
  onFontSansChange: (next: string) => void;
  onFontMonoChange: (next: string) => void;
}

type SectionId = 'typography' | 'geometry' | 'components' | 'spacing' | 'effects' | 'atmosphere';

interface SectionMeta {
  id: SectionId;
  icon: LucideIcon;
  label: string;
  hint: string;
}

const SECTIONS: readonly SectionMeta[] = [
  { id: 'typography', icon: Type, label: 'Typography', hint: 'Font families and text size' },
  { id: 'geometry', icon: Shapes, label: 'Geometry', hint: 'Radius and corner shape' },
  { id: 'components', icon: Blocks, label: 'Components', hint: 'Tune each component' },
  { id: 'spacing', icon: Ruler, label: 'Spacing', hint: 'Overall density' },
  { id: 'effects', icon: Layers, label: 'Effects', hint: 'Shadows and borders' },
  { id: 'atmosphere', icon: Wind, label: 'Atmosphere', hint: 'Blur, focus, motion' },
];

const STORAGE_KEY = 'brika.theme-builder.design-section';
const DEFAULT_SECTION: SectionId = 'typography';

function isSectionId(value: unknown): value is SectionId {
  return (
    value === 'typography' ||
    value === 'geometry' ||
    value === 'components' ||
    value === 'spacing' ||
    value === 'effects' ||
    value === 'atmosphere'
  );
}

function readActiveSection(): SectionId {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (isSectionId(raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SECTION;
}

function writeActiveSection(id: SectionId): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function DesignTab({
  draft,
  patch,
  onChange,
  onFontSansChange,
  onFontMonoChange,
}: Readonly<DesignTabProps>) {
  const [active, setActive] = useState<SectionId>(() => readActiveSection());

  const selectSection = useCallback((id: SectionId) => {
    setActive(id);
    writeActiveSection(id);
  }, []);

  const activeMeta = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-background/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-1" role="tablist" aria-label="Design sections">
          {SECTIONS.map((section) => (
            <SectionTab
              key={section.id}
              section={section}
              active={section.id === active}
              onSelect={selectSection}
            />
          ))}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 px-1">
          <span className="font-semibold text-sm">{activeMeta.label}</span>
          <span className="truncate text-[10px] text-muted-foreground">{activeMeta.hint}</span>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        <SectionBody
          id={active}
          draft={draft}
          patch={patch}
          onChange={onChange}
          onFontSansChange={onFontSansChange}
          onFontMonoChange={onFontMonoChange}
        />
      </div>
    </>
  );
}

interface SectionTabProps {
  section: SectionMeta;
  active: boolean;
  onSelect: (id: SectionId) => void;
}

function SectionTab({ section, active, onSelect }: Readonly<SectionTabProps>) {
  const Icon = section.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          aria-label={section.label}
          onClick={() => onSelect(section.id)}
          className={cn(
            'flex size-9 flex-1 items-center justify-center rounded-control transition-colors',
            active
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {section.label}
      </TooltipContent>
    </Tooltip>
  );
}

interface SectionBodyProps {
  id: SectionId;
  draft: ThemeConfig;
  patch: <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => void;
  onChange: (next: ThemeConfig) => void;
  onFontSansChange: (next: string) => void;
  onFontMonoChange: (next: string) => void;
}

function SectionBody({
  id,
  draft,
  patch,
  onChange,
  onFontSansChange,
  onFontMonoChange,
}: Readonly<SectionBodyProps>): ReactNode {
  switch (id) {
    case 'typography':
      return (
        <>
          <FontField
            label="Sans"
            value={draft.fonts.sans}
            onChange={onFontSansChange}
            choices={SANS_FONT_CHOICES}
            sample="The quick brown fox jumps over the lazy dog"
          />
          <FontField
            label="Mono"
            value={draft.fonts.mono}
            onChange={onFontMonoChange}
            choices={MONO_FONT_CHOICES}
            sample="const answer = 42;"
          />
          <div className="space-y-2 pt-1">
            <TokenLabel cssVar="--text-base">Base size</TokenLabel>
            <TextSizeField value={draft.textBase ?? 1} onChange={(v) => patch('textBase', v)} />
          </div>
        </>
      );
    case 'geometry':
      return (
        <>
          <div className="space-y-2">
            <TokenLabel cssVar="--radius">Radius</TokenLabel>
            <RadiusField value={draft.radius} onChange={(v) => patch('radius', v)} />
          </div>
          <CornerField
            value={draft.corners ?? 'round'}
            onChange={(v: CornerStyle) => patch('corners', v)}
            radius={draft.radius}
          />
        </>
      );
    case 'components':
      return <ComponentsSection draft={draft} onChange={onChange} />;
    case 'spacing':
      return (
        <>
          <TokenLabel cssVar="--spacing">Base unit</TokenLabel>
          <SpacingField value={draft.spacing ?? 0.25} onChange={(v) => patch('spacing', v)} />
        </>
      );
    case 'effects':
      return (
        <>
          <TokenLabel cssVar="--shadow-*">Elevation</TokenLabel>
          <ElevationField
            value={draft.elevation ?? 'soft'}
            onChange={(v: ElevationStyle) => patch('elevation', v)}
            tint={draft.elevationTint ?? false}
            onTintChange={(v) => patch('elevationTint', v)}
          />
          <div className="pt-1">
            <TokenLabel cssVar="--border-width">Border width</TokenLabel>
          </div>
          <BorderWidthField
            value={draft.borderWidth ?? 1}
            onChange={(v) => patch('borderWidth', v)}
          />
        </>
      );
    case 'atmosphere':
      return (
        <>
          <TokenLabel cssVar="--backdrop-blur">Backdrop blur</TokenLabel>
          <BlurField value={draft.backdropBlur ?? 8} onChange={(v) => patch('backdropBlur', v)} />

          <div className="pt-1">
            <TokenLabel cssVar="--ring-*">Focus ring</TokenLabel>
          </div>
          <FocusRingField
            width={draft.ringWidth ?? 2}
            offset={draft.ringOffset ?? 2}
            onWidthChange={(v) => patch('ringWidth', v)}
            onOffsetChange={(v) => patch('ringOffset', v)}
          />

          <div className="pt-1">
            <TokenLabel hint="hover to feel it">Motion</TokenLabel>
          </div>
          <MotionField
            value={draft.motion ?? 'smooth'}
            onChange={(v: MotionStyle) => patch('motion', v)}
          />
        </>
      );
  }
}
