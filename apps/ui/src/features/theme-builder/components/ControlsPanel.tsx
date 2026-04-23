/**
 * ControlsPanel — the editor column.
 *
 * Top-level tabs split content so each half has its full height:
 *   • Design tab — Typography / Geometry / Spacing / Effects / Atmosphere
 *   • Palette tab — the color tokens with search + sync utilities
 *
 * Inside Design, sections remain collapsible; `sessionStorage` remembers
 * which sections are open so the panel keeps its shape.
 */

import {
  ArrowLeftRight,
  Palette as PaletteIcon,
  Search,
  Sliders,
  Sparkles,
  SunMoon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { invertLightness, mix, parseHex, shiftLightness } from '../color-utils';
import { MONO_FONT_CHOICES, SANS_FONT_CHOICES, TOKEN_GROUPS } from '../tokens';
import type {
  ColorToken,
  CornerStyle,
  ElevationStyle,
  MotionStyle,
  ThemeColors,
  ThemeConfig,
} from '../types';
import { ColorField } from './ColorField';
import { ControlSection } from './ControlSection';
import { CornerField } from './CornerField';
import { BlurField, FocusRingField, MotionField } from './EffectsExtras';
import { BorderWidthField, ElevationField } from './EffectsField';
import { FontField } from './FontField';
import { TokenLabel } from './primitives';
import { RadiusField } from './RadiusField';
import { SpacingField } from './SpacingField';

const FOREGROUND_PAIRS: Partial<Record<ColorToken, { token: ColorToken; label: string }>> = {
  foreground: { token: 'background', label: 'on background' },
  'card-foreground': { token: 'card', label: 'on card' },
  'popover-foreground': { token: 'popover', label: 'on popover' },
  'primary-foreground': { token: 'primary', label: 'on primary' },
  'secondary-foreground': { token: 'secondary', label: 'on secondary' },
  'accent-foreground': { token: 'accent', label: 'on accent' },
  'muted-foreground': { token: 'muted', label: 'on muted' },
  'success-foreground': { token: 'success', label: 'on success' },
  'warning-foreground': { token: 'warning', label: 'on warning' },
  'info-foreground': { token: 'info', label: 'on info' },
  'destructive-foreground': { token: 'destructive', label: 'on destructive' },
};

interface ControlsPanelProps {
  draft: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}

function generateFromPrimary(colors: ThemeColors, mode: 'light' | 'dark'): ThemeColors {
  const primary = colors.primary;
  if (!parseHex(primary)) {
    return colors;
  }
  const isDark = mode === 'dark';
  return {
    ...colors,
    accent: mix(colors.background, primary, isDark ? 0.15 : 0.12),
    'accent-foreground': colors.foreground,
    secondary: mix(colors.background, primary, isDark ? 0.08 : 0.06),
    'secondary-foreground': colors.foreground,
    muted: mix(colors.background, primary, isDark ? 0.05 : 0.04),
    'muted-foreground': isDark
      ? shiftLightness(colors.foreground, -0.15)
      : shiftLightness(colors.foreground, 0.3),
    ring: primary,
  };
}

export function ControlsPanel({ draft, onChange }: Readonly<ControlsPanelProps>) {
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>('light');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'design' | 'palette'>('design');

  const palette = draft.colors[editingMode];

  const updateColor = (token: ColorToken, value: string) => {
    const next: ThemeColors = { ...palette, [token]: value };
    onChange({
      ...draft,
      colors: { ...draft.colors, [editingMode]: next },
    });
  };

  const patch = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) =>
    onChange({ ...draft, [key]: value });

  const updateFontSans = (sans: string) => onChange({ ...draft, fonts: { ...draft.fonts, sans } });
  const updateFontMono = (mono: string) => onChange({ ...draft, fonts: { ...draft.fonts, mono } });
  const updateMeta = <K extends 'name' | 'description' | 'author'>(key: K, value: string) =>
    onChange({ ...draft, [key]: value });

  const copyMode = (from: 'light' | 'dark') => {
    const target = from === 'light' ? 'dark' : 'light';
    onChange({
      ...draft,
      colors: { ...draft.colors, [target]: { ...draft.colors[from] } },
    });
    setEditingMode(target);
  };

  const autoInvertTo = (target: 'light' | 'dark') => {
    const source = target === 'light' ? 'dark' : 'light';
    const src = draft.colors[source];
    const entries = Object.entries(src) as [ColorToken, string][];
    const inverted = { ...src };
    for (const [k, v] of entries) {
      inverted[k] = invertLightness(v);
    }
    onChange({
      ...draft,
      colors: { ...draft.colors, [target]: inverted },
    });
    setEditingMode(target);
  };

  const generateNeutrals = () => {
    const next = generateFromPrimary(palette, editingMode);
    onChange({
      ...draft,
      colors: { ...draft.colors, [editingMode]: next },
    });
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) {
      return TOKEN_GROUPS;
    }
    return TOKEN_GROUPS.map((g) => ({
      ...g,
      tokens: g.tokens.filter((t) => t.toLowerCase().includes(normalizedQuery)),
    })).filter((g) => g.tokens.length > 0);
  }, [normalizedQuery]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Meta — slim header */}
      <div className="shrink-0 space-y-1 border-b px-3 py-2.5">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateMeta('name', e.target.value)}
          placeholder="Theme name"
          className="w-full bg-transparent font-semibold text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <input
          type="text"
          value={draft.description ?? ''}
          onChange={(e) => updateMeta('description', e.target.value)}
          placeholder="Short description (optional)"
          className="w-full bg-transparent text-[11px] text-muted-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-2 grid shrink-0 grid-cols-2">
          <TabsTrigger value="design" className="gap-1.5 text-xs">
            <Sliders className="size-3.5" />
            Design
          </TabsTrigger>
          <TabsTrigger value="palette" className="gap-1.5 text-xs">
            <PaletteIcon className="size-3.5" />
            Palette
          </TabsTrigger>
        </TabsList>

        {/* ─── Design tab ─────────────────────────────────────── */}
        <TabsContent
          value="design"
          className="mt-2 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
        >
          <ControlSection id="typography" index={1} title="Typography">
            <FontField
              label="Sans"
              value={draft.fonts.sans}
              onChange={updateFontSans}
              choices={SANS_FONT_CHOICES}
              sample="The quick brown fox jumps over the lazy dog"
            />
            <FontField
              label="Mono"
              value={draft.fonts.mono}
              onChange={updateFontMono}
              choices={MONO_FONT_CHOICES}
              sample="const answer = 42;"
            />
          </ControlSection>

          <ControlSection id="geometry" index={2} title="Geometry" hint="radius · corners">
            <div className="space-y-2">
              <TokenLabel cssVar="--radius">Radius</TokenLabel>
              <RadiusField value={draft.radius} onChange={(v) => patch('radius', v)} />
            </div>
            <CornerField
              value={draft.corners ?? 'round'}
              onChange={(v: CornerStyle) => patch('corners', v)}
              radius={draft.radius}
            />
          </ControlSection>

          <ControlSection id="spacing" index={3} title="Spacing" hint="density" defaultOpen={false}>
            <TokenLabel cssVar="--spacing">Base unit</TokenLabel>
            <SpacingField value={draft.spacing ?? 0.25} onChange={(v) => patch('spacing', v)} />
          </ControlSection>

          <ControlSection id="effects" index={4} title="Effects" hint="shadow · border">
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
          </ControlSection>

          <ControlSection
            id="atmosphere"
            index={5}
            title="Atmosphere"
            hint="blur · focus · motion"
            defaultOpen={false}
          >
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
          </ControlSection>
        </TabsContent>

        {/* ─── Palette tab ────────────────────────────────────── */}
        <TabsContent
          value="palette"
          className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          {/* Sticky palette toolbar */}
          <div className="shrink-0 space-y-2 border-b px-3 pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter tokens"
                  className="w-full rounded-md border bg-background py-1 pr-2 pl-7 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Tabs
                value={editingMode}
                onValueChange={(v) => setEditingMode(v as 'light' | 'dark')}
              >
                <TabsList className="h-7">
                  <TabsTrigger value="light" className="h-6 px-2 text-[10px]">
                    Light
                  </TabsTrigger>
                  <TabsTrigger value="dark" className="h-6 px-2 text-[10px]">
                    Dark
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-wrap gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]">
                    <SunMoon className="size-3" /> Sync
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs">
                  <DropdownMenuItem onSelect={() => copyMode('light')}>
                    <ArrowLeftRight className="size-3" />
                    Copy light → dark
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => copyMode('dark')}>
                    <ArrowLeftRight className="size-3" />
                    Copy dark → light
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => autoInvertTo('dark')}>
                    <SunMoon className="size-3" />
                    Auto-invert to dark
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => autoInvertTo('light')}>
                    <SunMoon className="size-3" />
                    Auto-invert to light
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="outline"
                onClick={generateNeutrals}
                title="Derive accent/secondary/muted shades from the current primary"
                className="h-6 gap-1 px-1.5 text-[10px]"
              >
                <Sparkles className="size-3" />
                Tint from primary
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            {filteredGroups.length === 0 && (
              <div className="px-2 py-6 text-center text-muted-foreground text-xs">
                No tokens match "{query}".
              </div>
            )}
            {filteredGroups.map((group) => (
              <div key={group.key} className="space-y-1.5">
                <div className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                  {group.key}
                </div>
                <div className="space-y-1">
                  {group.tokens.map((token) => {
                    const pair = FOREGROUND_PAIRS[token];
                    return (
                      <ColorField
                        key={token}
                        label={token}
                        value={palette[token]}
                        onChange={(v) => updateColor(token, v)}
                        pairWith={pair ? palette[pair.token] : undefined}
                        pairLabel={pair?.label}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
