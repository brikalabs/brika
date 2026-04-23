/**
 * ComponentsSection — per-component token editor.
 *
 * List view groups components by role (Controls / Surfaces / Overlays)
 * and shows which ones have active overrides. Selecting a row opens a
 * detail view with a live preview and every token the component
 * exposes: radius today, plus any per-component color tokens defined
 * in `ThemeColors`. Adding a new token type (shadow, border, etc.)
 * means a new `Field` row and a new entry in `ComponentMeta`.
 */

import {
  ArrowLeft,
  ChevronRight,
  Link2,
  type LucideIcon,
  Moon,
  RotateCcw,
  Sun,
  Unlink2,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useCallback, useMemo, useState } from 'react';
import { Slider } from '@/components/ui';
import { cn } from '@/lib/utils';
import { type ThemeVars, themeToVars } from '../theme-css';
import type {
  ColorToken,
  ComponentRadiusKey,
  ComponentTokens,
  CornerStyle,
  ThemeColors,
  ThemeConfig,
} from '../types';
import { ColorField } from './ColorField';
import { CornerField } from './CornerField';

type StyleWithVars = CSSProperties & ThemeVars;
type PreviewMode = 'light' | 'dark';

/**
 * Which palettes an override touches.
 *   'both'  — write (or clear) the same value on light and dark
 *   'light' — touch only the light palette
 *   'dark'  — touch only the dark palette
 */
type ColorSlot = 'light' | 'dark' | 'both';
type ColorSetter = (token: ColorToken, slot: ColorSlot, value: string | undefined) => void;

/**
 * Writes a single field under `componentTokens[key]`. Passing
 * `undefined` clears that field; the key itself is pruned when no
 * fields remain.
 */
type ComponentTokenSetter = <F extends keyof ComponentTokens>(
  key: ComponentRadiusKey,
  field: F,
  value: ComponentTokens[F] | undefined
) => void;

/* ─── Registry ───────────────────────────────────────────── */

interface ColorTokenMeta {
  /** Component-scope token key on `ThemeColors`. */
  key: ColorToken;
  label: string;
  /** System role this token falls back to when unset. */
  fallbackKey: ColorToken;
  fallbackLabel: string;
  /** Optional pair for the WCAG contrast badge. */
  pairKey?: ColorToken;
  pairLabel?: string;
}

interface ComponentMeta {
  key: ComponentRadiusKey;
  label: string;
  description: string;
  /** rem offset from `theme.radius` matching the system default. */
  seedOffset: number;
  colorTokens: readonly ColorTokenMeta[];
  /** Render a live preview using the component's utility classes. */
  Preview: () => ReactNode;
}

interface ComponentGroup {
  id: string;
  label: string;
  items: readonly ComponentMeta[];
}

/* ─── Previews ───────────────────────────────────────────── */

function ButtonPreview() {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center justify-center rounded-button bg-button-filled-container px-3 py-1.5 font-medium text-button-filled-label text-xs shadow-button">
        Primary
      </div>
      <div className="inline-flex items-center justify-center rounded-button border border-button-outline-border bg-transparent px-3 py-1.5 font-medium text-button-outline-label text-xs">
        Outline
      </div>
    </div>
  );
}

function InputPreview() {
  return (
    <div className="rounded-input border border-input-border bg-input-container px-2.5 py-1.5 text-input-label text-xs">
      <span className="text-input-placeholder">Username</span>
    </div>
  );
}

function SelectPreview() {
  return (
    <div className="flex items-center justify-between rounded-select border border-input-border bg-input-container px-2.5 py-1.5 text-input-label text-xs">
      <span>Option A</span>
      <span className="text-muted-foreground">▾</span>
    </div>
  );
}

function CheckboxPreview() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-4 items-center justify-center rounded-checkbox border border-primary bg-primary text-[10px] text-primary-foreground">
        ✓
      </div>
      <div className="size-4 rounded-checkbox border border-input" />
    </div>
  );
}

function TabsPreview() {
  return (
    <div className="inline-flex items-center gap-1 rounded-tabs bg-muted p-1">
      <div className="rounded-tabs bg-background px-2.5 py-1 font-medium text-foreground text-xs shadow-sm">
        Active
      </div>
      <div className="rounded-tabs px-2.5 py-1 text-muted-foreground text-xs">Idle</div>
    </div>
  );
}

function BadgePreview() {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-badge bg-primary px-2 py-0.5 font-medium text-[10px] text-primary-foreground">
        New
      </div>
      <div className="inline-flex items-center rounded-badge border border-border px-2 py-0.5 font-medium text-[10px] text-foreground">
        Beta
      </div>
    </div>
  );
}

function CardPreview() {
  return (
    <div className="rounded-card border bg-card-container p-3 text-card-label shadow-card">
      <div className="font-semibold text-xs">Card title</div>
      <div className="mt-1 text-[10px] text-muted-foreground">Lorem ipsum dolor sit amet.</div>
    </div>
  );
}

function AlertPreview() {
  return (
    <div className="rounded-alert border bg-background p-2.5 text-foreground">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 size-2 shrink-0 rounded-full bg-info" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-xs">Heads up</div>
          <div className="text-[10px] text-muted-foreground">This is an informational alert.</div>
        </div>
      </div>
    </div>
  );
}

function ToastPreview() {
  return (
    <div className="rounded-toast border bg-background p-2.5 shadow-toast">
      <div className="font-semibold text-xs">Saved</div>
      <div className="text-[10px] text-muted-foreground">Your changes were persisted.</div>
    </div>
  );
}

function DialogPreview() {
  return (
    <div className="rounded-dialog border bg-dialog-container p-3 text-dialog-label shadow-dialog">
      <div className="font-semibold text-xs">Confirm action</div>
      <div className="mt-1 text-[10px] text-muted-foreground">Proceed with changes?</div>
    </div>
  );
}

function PopoverPreview() {
  return (
    <div className="rounded-popover border bg-popover p-2.5 text-popover-foreground shadow-popover">
      <div className="font-semibold text-xs">Popover</div>
      <div className="mt-1 text-[10px] text-muted-foreground">Floating content.</div>
    </div>
  );
}

function MenuPreview() {
  return (
    <div className="rounded-menu border bg-popover p-1 text-popover-foreground shadow-menu">
      <div className="rounded-menu-item bg-accent px-2 py-1 text-accent-foreground text-xs">
        Selected
      </div>
      <div className="rounded-menu-item px-2 py-1 text-xs">Another item</div>
      <div className="rounded-menu-item px-2 py-1 text-xs">Third</div>
    </div>
  );
}

function MenuItemPreview() {
  return (
    <div className="space-y-1 rounded-menu border bg-popover p-1 shadow-menu">
      <div className="rounded-menu-item bg-accent px-2 py-1 text-accent-foreground text-xs">
        Hovered
      </div>
      <div className="rounded-menu-item px-2 py-1 text-popover-foreground text-xs">Idle</div>
    </div>
  );
}

function TooltipPreview() {
  return (
    <div className="inline-flex items-center rounded-tooltip bg-foreground px-2 py-1 text-[10px] text-background shadow-tooltip">
      Tooltip text
    </div>
  );
}

function AvatarPreview() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-9 items-center justify-center rounded-avatar bg-primary font-semibold text-primary-foreground text-sm">
        MS
      </div>
      <div className="flex size-9 items-center justify-center rounded-avatar bg-muted font-semibold text-muted-foreground text-sm">
        JD
      </div>
      <div className="flex size-9 items-center justify-center rounded-avatar bg-accent font-semibold text-accent-foreground text-sm">
        AR
      </div>
    </div>
  );
}

function SwitchPreview() {
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex h-5 w-9 items-center rounded-switch bg-primary px-0.5">
        <div className="ml-auto size-4 rounded-switch-thumb bg-primary-foreground shadow-xs" />
      </div>
      <div className="inline-flex h-5 w-9 items-center rounded-switch bg-input px-0.5">
        <div className="size-4 rounded-switch-thumb bg-background shadow-xs" />
      </div>
    </div>
  );
}

/* ─── Metadata ───────────────────────────────────────────── */

const GROUPS: readonly ComponentGroup[] = [
  {
    id: 'controls',
    label: 'Controls',
    items: [
      {
        key: 'button',
        label: 'Button',
        description: 'Primary action surface. Filled and outline variants.',
        seedOffset: -0.25,
        colorTokens: [
          {
            key: 'button-filled-container',
            label: 'Filled background',
            fallbackKey: 'primary',
            fallbackLabel: 'Primary',
            pairKey: 'button-filled-label',
            pairLabel: 'label',
          },
          {
            key: 'button-filled-label',
            label: 'Filled label',
            fallbackKey: 'primary-foreground',
            fallbackLabel: 'Primary foreground',
            pairKey: 'button-filled-container',
            pairLabel: 'container',
          },
          {
            key: 'button-outline-border',
            label: 'Outline border',
            fallbackKey: 'border',
            fallbackLabel: 'Border',
          },
          {
            key: 'button-outline-label',
            label: 'Outline label',
            fallbackKey: 'foreground',
            fallbackLabel: 'Foreground',
            pairKey: 'background',
            pairLabel: 'surface',
          },
        ],
        Preview: ButtonPreview,
      },
      {
        key: 'input',
        label: 'Input',
        description: 'Text entry. Also drives Textarea and Select trigger.',
        seedOffset: -0.25,
        colorTokens: [
          {
            key: 'input-container',
            label: 'Background',
            fallbackKey: 'background',
            fallbackLabel: 'Background',
            pairKey: 'input-label',
            pairLabel: 'text',
          },
          {
            key: 'input-label',
            label: 'Text',
            fallbackKey: 'foreground',
            fallbackLabel: 'Foreground',
            pairKey: 'input-container',
            pairLabel: 'bg',
          },
          {
            key: 'input-border',
            label: 'Border',
            fallbackKey: 'input',
            fallbackLabel: 'Input',
          },
          {
            key: 'input-placeholder',
            label: 'Placeholder',
            fallbackKey: 'muted-foreground',
            fallbackLabel: 'Muted foreground',
            pairKey: 'input-container',
            pairLabel: 'bg',
          },
        ],
        Preview: InputPreview,
      },
      {
        key: 'select',
        label: 'Select',
        description: 'Dropdown trigger. Inherits input colors.',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: SelectPreview,
      },
      {
        key: 'checkbox',
        label: 'Checkbox',
        description: 'Binary toggle. Usually nearly square.',
        seedOffset: -0.625,
        colorTokens: [],
        Preview: CheckboxPreview,
      },
      {
        key: 'tabs',
        label: 'Tabs',
        description: 'Segmented nav. The pills inside the rail.',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: TabsPreview,
      },
      {
        key: 'badge',
        label: 'Badge',
        description: 'Small status chip. Often a pill.',
        seedOffset: -0.375,
        colorTokens: [],
        Preview: BadgePreview,
      },
      {
        key: 'switch',
        label: 'Switch',
        description: 'Binary toggle, pill-shaped by default.',
        seedOffset: 9999,
        colorTokens: [],
        Preview: SwitchPreview,
      },
    ],
  },
  {
    id: 'surfaces',
    label: 'Surfaces',
    items: [
      {
        key: 'card',
        label: 'Card',
        description: 'Resting container for content blocks.',
        seedOffset: 0,
        colorTokens: [
          {
            key: 'card-container',
            label: 'Background',
            fallbackKey: 'card',
            fallbackLabel: 'Card',
            pairKey: 'card-label',
            pairLabel: 'label',
          },
          {
            key: 'card-label',
            label: 'Foreground',
            fallbackKey: 'card-foreground',
            fallbackLabel: 'Card foreground',
            pairKey: 'card-container',
            pairLabel: 'bg',
          },
        ],
        Preview: CardPreview,
      },
      {
        key: 'alert',
        label: 'Alert',
        description: 'Inline banner for status messages.',
        seedOffset: 0,
        colorTokens: [],
        Preview: AlertPreview,
      },
      {
        key: 'toast',
        label: 'Toast',
        description: 'Transient notification, floats above content.',
        seedOffset: 0,
        colorTokens: [],
        Preview: ToastPreview,
      },
      {
        key: 'avatar',
        label: 'Avatar',
        description: 'User portrait surface, circular by default.',
        seedOffset: 9999,
        colorTokens: [],
        Preview: AvatarPreview,
      },
    ],
  },
  {
    id: 'overlays',
    label: 'Overlays',
    items: [
      {
        key: 'dialog',
        label: 'Dialog',
        description: 'Modal surface. Sits on the spotlight backdrop.',
        seedOffset: 0.25,
        colorTokens: [
          {
            key: 'dialog-container',
            label: 'Background',
            fallbackKey: 'popover',
            fallbackLabel: 'Popover',
            pairKey: 'dialog-label',
            pairLabel: 'label',
          },
          {
            key: 'dialog-label',
            label: 'Foreground',
            fallbackKey: 'popover-foreground',
            fallbackLabel: 'Popover foreground',
            pairKey: 'dialog-container',
            pairLabel: 'bg',
          },
        ],
        Preview: DialogPreview,
      },
      {
        key: 'popover',
        label: 'Popover',
        description: 'Floating surface anchored to a trigger.',
        seedOffset: 0.25,
        colorTokens: [],
        Preview: PopoverPreview,
      },
      {
        key: 'menu',
        label: 'Menu',
        description: 'Dropdown container for menu items.',
        seedOffset: 0.25,
        colorTokens: [],
        Preview: MenuPreview,
      },
      {
        key: 'menu-item',
        label: 'Menu item',
        description: 'Individual row inside a menu.',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: MenuItemPreview,
      },
      {
        key: 'tooltip',
        label: 'Tooltip',
        description: 'Small hover bubble with a label.',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: TooltipPreview,
      },
    ],
  },
];

const ALL_COMPONENTS: readonly ComponentMeta[] = GROUPS.flatMap((g) => g.items);

/* ─── Helpers ────────────────────────────────────────────── */

const RADIUS_SLIDER_MAX = 2;

function seedFor(baseRadius: number, offset: number): number {
  return Math.max(0, Math.min(RADIUS_SLIDER_MAX, +(baseRadius + offset).toFixed(3)));
}

function countOverrides(draft: ThemeConfig, meta: ComponentMeta): number {
  let count = 0;
  const entry = draft.componentTokens?.[meta.key];
  if (entry?.radius !== undefined) {
    count += 1;
  }
  if (entry?.corners !== undefined) {
    count += 1;
  }
  for (const token of meta.colorTokens) {
    const hasLight = draft.colors.light[token.key] !== undefined;
    const hasDark = draft.colors.dark[token.key] !== undefined;
    if (hasLight || hasDark) {
      count += 1;
    }
  }
  return count;
}

function resolveColor(colors: ThemeColors, key: ColorToken): string {
  return colors[key] ?? '#000000';
}

/* ─── Section ────────────────────────────────────────────── */

interface ComponentsSectionProps {
  draft: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}

export function ComponentsSection({ draft, onChange }: Readonly<ComponentsSectionProps>) {
  const [selected, setSelected] = useState<ComponentRadiusKey | null>(null);

  const setComponentToken = useCallback<ComponentTokenSetter>(
    (key, field, value) => {
      const nextTokens: Partial<Record<ComponentRadiusKey, ComponentTokens>> = {
        ...draft.componentTokens,
      };
      const current: ComponentTokens = { ...nextTokens[key] };
      if (value === undefined) {
        delete current[field];
      } else {
        current[field] = value;
      }
      if (current.radius === undefined && current.corners === undefined) {
        delete nextTokens[key];
      } else {
        nextTokens[key] = current;
      }
      onChange({
        ...draft,
        componentTokens: Object.keys(nextTokens).length === 0 ? undefined : nextTokens,
      });
    },
    [draft, onChange]
  );

  const setColor = useCallback<ColorSetter>(
    (token, slot, value) => {
      const light = { ...draft.colors.light };
      const dark = { ...draft.colors.dark };
      if (slot === 'light' || slot === 'both') {
        if (value === undefined) {
          delete light[token];
        } else {
          light[token] = value;
        }
      }
      if (slot === 'dark' || slot === 'both') {
        if (value === undefined) {
          delete dark[token];
        } else {
          dark[token] = value;
        }
      }
      onChange({ ...draft, colors: { light, dark } });
    },
    [draft, onChange]
  );

  const resetComponent = useCallback(
    (meta: ComponentMeta) => {
      const nextTokens: Partial<Record<ComponentRadiusKey, ComponentTokens>> = {
        ...draft.componentTokens,
      };
      delete nextTokens[meta.key];

      const light = { ...draft.colors.light };
      const dark = { ...draft.colors.dark };
      for (const token of meta.colorTokens) {
        delete light[token.key];
        delete dark[token.key];
      }

      onChange({
        ...draft,
        componentTokens: Object.keys(nextTokens).length === 0 ? undefined : nextTokens,
        colors: { light, dark },
      });
    },
    [draft, onChange]
  );

  const selectedMeta = selected ? ALL_COMPONENTS.find((c) => c.key === selected) : undefined;

  if (selectedMeta) {
    return (
      <ComponentDetail
        meta={selectedMeta}
        draft={draft}
        onBack={() => setSelected(null)}
        onTokenChange={setComponentToken}
        onColorChange={setColor}
        onResetAll={() => resetComponent(selectedMeta)}
      />
    );
  }

  const totalOverrides = ALL_COMPONENTS.reduce((sum, meta) => sum + countOverrides(draft, meta), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Pick a component to tune its tokens</span>
        <span className="tabular-nums">
          {totalOverrides > 0 ? `${totalOverrides} customized` : 'All defaults'}
        </span>
      </div>
      {GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <div className="px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
            {group.label}
          </div>
          <div className="divide-y overflow-hidden rounded-container border">
            {group.items.map((meta) => (
              <ComponentRow
                key={meta.key}
                meta={meta}
                draft={draft}
                onSelect={() => setSelected(meta.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Row ────────────────────────────────────────────────── */

interface ComponentRowProps {
  meta: ComponentMeta;
  draft: ThemeConfig;
  onSelect: () => void;
}

function pluralize(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`;
}

function ComponentRow({ meta, draft, onSelect }: Readonly<ComponentRowProps>) {
  const overrides = countOverrides(draft, meta);
  const customized = overrides > 0;
  const radius =
    draft.componentTokens?.[meta.key]?.radius ?? seedFor(draft.radius, meta.seedOffset);
  const subtitle = customized ? pluralize(overrides, 'customization') : meta.description;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-muted/50"
    >
      <div
        aria-hidden
        className={cn(
          'size-7 shrink-0 border-2 transition-colors',
          customized ? 'border-primary/60 bg-primary/15' : 'border-muted-foreground/30 bg-muted/40'
        )}
        style={{ borderRadius: `${radius}rem` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-xs">{meta.label}</span>
          {customized && (
            <span aria-label="Customized" className="size-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

/* ─── Detail ─────────────────────────────────────────────── */

interface ComponentDetailProps {
  meta: ComponentMeta;
  draft: ThemeConfig;
  onBack: () => void;
  onTokenChange: ComponentTokenSetter;
  onColorChange: ColorSetter;
  onResetAll: () => void;
}

function ComponentDetail({
  meta,
  draft,
  onBack,
  onTokenChange,
  onColorChange,
  onResetAll,
}: Readonly<ComponentDetailProps>) {
  const [mode, setMode] = useState<PreviewMode>('light');
  const entry = draft.componentTokens?.[meta.key];
  const radiusValue = entry?.radius;
  const radiusOverridden = radiusValue !== undefined;
  const effectiveRadius = radiusValue ?? seedFor(draft.radius, meta.seedOffset);
  const cornersValue = entry?.corners;
  const cornersOverridden = cornersValue !== undefined;
  const effectiveCorners: CornerStyle = cornersValue ?? draft.corners ?? 'round';
  const totalOverrides = countOverrides(draft, meta);
  const hasColorTokens = meta.colorTokens.length > 0;
  const { Preview } = meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex size-6 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to components"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sm">{meta.label}</div>
          <div className="truncate text-[10px] text-muted-foreground">{meta.description}</div>
        </div>
        <button
          type="button"
          onClick={onResetAll}
          disabled={totalOverrides === 0}
          className={cn(
            'text-[10px] transition-colors',
            totalOverrides > 0
              ? 'text-muted-foreground hover:text-foreground'
              : 'pointer-events-none opacity-0'
          )}
        >
          Reset all
        </button>
      </div>

      <PreviewStage draft={draft} mode={mode} onModeChange={setMode}>
        <Preview />
      </PreviewStage>

      <DetailGroup label="Shape">
        <Field
          label="Radius"
          hint="rem"
          overridden={radiusOverridden}
          onReset={() => onTokenChange(meta.key, 'radius', undefined)}
        >
          <Slider
            value={effectiveRadius}
            onChange={(v) => onTokenChange(meta.key, 'radius', v)}
            min={0}
            max={RADIUS_SLIDER_MAX}
            step={0.125}
            unit="rem"
            numericWidth="w-14"
            decimals={3}
          />
        </Field>
        <Field
          label="Corners"
          hint={cornersOverridden ? 'Custom' : 'Theme default'}
          overridden={cornersOverridden}
          onReset={() => onTokenChange(meta.key, 'corners', undefined)}
        >
          <CornerField
            value={effectiveCorners}
            onChange={(v) => onTokenChange(meta.key, 'corners', v)}
            radius={effectiveRadius}
          />
        </Field>
      </DetailGroup>

      {hasColorTokens && (
        <DetailGroup label="Colors" hint="Per-mode when split">
          {meta.colorTokens.map((token) => (
            <ColorTokenField
              key={token.key}
              token={token}
              draft={draft}
              mode={mode}
              onChange={onColorChange}
            />
          ))}
        </DetailGroup>
      )}

      {!hasColorTokens && (
        <div className="rounded-container border border-dashed px-3 py-4 text-center text-[10px] text-muted-foreground">
          No color overrides yet for this component. Radius is fully tunable above.
        </div>
      )}
    </div>
  );
}

/* ─── Preview stage ──────────────────────────────────────── */

interface PreviewStageProps {
  draft: ThemeConfig;
  mode: PreviewMode;
  onModeChange: (next: PreviewMode) => void;
  children: ReactNode;
}

function PreviewStage({ draft, mode, onModeChange, children }: Readonly<PreviewStageProps>) {
  const style = useMemo<StyleWithVars>(
    () => ({ ...themeToVars(draft, mode), fontFamily: 'var(--font-sans)' }),
    [draft, mode]
  );
  return (
    <div className="overflow-hidden rounded-container border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1">
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          Preview
        </span>
        <div className="flex items-center rounded-control bg-background p-0.5 shadow-xs">
          <ModeButton label="Light" active={mode === 'light'} onClick={() => onModeChange('light')}>
            <Sun className="size-3" />
          </ModeButton>
          <ModeButton label="Dark" active={mode === 'dark'} onClick={() => onModeChange('dark')}>
            <Moon className="size-3" />
          </ModeButton>
        </div>
      </div>
      <div
        data-preview="component"
        className={cn(
          'flex min-h-24 items-center justify-center bg-background px-4 py-5 text-foreground',
          mode === 'dark' && 'dark'
        )}
        style={style}
      >
        {children}
      </div>
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

/* ─── Group / field primitives ───────────────────────────── */

interface DetailGroupProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function DetailGroup({ label, hint, children }: Readonly<DetailGroupProps>) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-semibold text-[11px] uppercase tracking-wider">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  overridden: boolean;
  onReset: () => void;
  children: ReactNode;
}

function Field({ label, hint, overridden, onReset, children }: Readonly<FieldProps>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-xs">{label}</span>
          {overridden && (
            <span aria-label="Customized" className="size-1.5 rounded-full bg-primary" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
          <ResetButton label={label} overridden={overridden} onReset={onReset} />
        </div>
      </div>
      {children}
    </div>
  );
}

interface ResetButtonProps {
  label: string;
  overridden: boolean;
  onReset: () => void;
}

function ResetButton({ label, overridden, onReset }: Readonly<ResetButtonProps>) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={!overridden}
      aria-label={`Reset ${label.toLowerCase()} to theme default`}
      title={overridden ? 'Reset to theme default' : 'Matches theme'}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-control transition-opacity',
        overridden
          ? 'text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground'
          : 'pointer-events-none opacity-0'
      )}
    >
      <RotateCcw className="size-3" />
    </button>
  );
}

/* ─── Color token field ──────────────────────────────────── */

interface ColorTokenFieldProps {
  token: ColorTokenMeta;
  draft: ThemeConfig;
  mode: PreviewMode;
  onChange: ColorSetter;
}

/**
 * A color override can be unified (same value across light + dark) or
 * split (different value per mode). The component detects a natural
 * split from the draft; users can also opt-in explicitly via the
 * "Set different values…" affordance below the unified picker.
 */
function ColorTokenField({ token, draft, mode, onChange }: Readonly<ColorTokenFieldProps>) {
  const lightValue = draft.colors.light[token.key];
  const darkValue = draft.colors.dark[token.key];
  const hasLight = lightValue !== undefined;
  const hasDark = darkValue !== undefined;
  const overridden = hasLight || hasDark;
  const naturallySplit = hasLight && hasDark && lightValue !== darkValue;
  const [userExpanded, setUserExpanded] = useState(false);
  const split = naturallySplit || userExpanded;

  const resetAll = useCallback(() => {
    onChange(token.key, 'both', undefined);
    setUserExpanded(false);
  }, [onChange, token.key]);

  const unify = useCallback(() => {
    const winning = lightValue ?? darkValue;
    if (winning !== undefined) {
      onChange(token.key, 'both', winning);
    }
    setUserExpanded(false);
  }, [onChange, token.key, lightValue, darkValue]);

  if (split) {
    const lightEff = lightValue ?? resolveColor(draft.colors.light, token.fallbackKey);
    const darkEff = darkValue ?? resolveColor(draft.colors.dark, token.fallbackKey);
    const pairLight = token.pairKey
      ? (draft.colors.light[token.pairKey] ?? resolveColor(draft.colors.light, token.pairKey))
      : undefined;
    const pairDark = token.pairKey
      ? (draft.colors.dark[token.pairKey] ?? resolveColor(draft.colors.dark, token.pairKey))
      : undefined;
    return (
      <Field label={token.label} hint="Per-mode" overridden={overridden} onReset={resetAll}>
        <div className="space-y-2">
          <ModeColorRow
            icon={Sun}
            modeLabel="Light"
            active={mode === 'light'}
            overridden={hasLight}
            onReset={() => onChange(token.key, 'light', undefined)}
          >
            <ColorField
              label={`${token.label} (light)`}
              value={lightEff}
              onChange={(v) => onChange(token.key, 'light', v)}
              pairWith={pairLight}
              pairLabel={token.pairLabel}
            />
          </ModeColorRow>
          <ModeColorRow
            icon={Moon}
            modeLabel="Dark"
            active={mode === 'dark'}
            overridden={hasDark}
            onReset={() => onChange(token.key, 'dark', undefined)}
          >
            <ColorField
              label={`${token.label} (dark)`}
              value={darkEff}
              onChange={(v) => onChange(token.key, 'dark', v)}
              pairWith={pairDark}
              pairLabel={token.pairLabel}
            />
          </ModeColorRow>
          <InlineActionButton icon={Link2} onClick={unify}>
            Use one value for both modes
          </InlineActionButton>
        </div>
      </Field>
    );
  }

  const paletteForMode = mode === 'light' ? draft.colors.light : draft.colors.dark;
  const currentValue = paletteForMode[token.key] ?? resolveColor(paletteForMode, token.fallbackKey);
  const pairForMode = token.pairKey
    ? (paletteForMode[token.pairKey] ?? resolveColor(paletteForMode, token.pairKey))
    : undefined;

  let hint: string;
  if (overridden) {
    hint = 'Shared';
  } else {
    hint = `Theme · ${token.fallbackLabel}`;
  }

  return (
    <Field label={token.label} hint={hint} overridden={overridden} onReset={resetAll}>
      <div className="space-y-2">
        <ColorField
          label={token.label}
          value={currentValue}
          onChange={(v) => onChange(token.key, 'both', v)}
          pairWith={pairForMode}
          pairLabel={token.pairLabel}
        />
        <InlineActionButton icon={Unlink2} onClick={() => setUserExpanded(true)}>
          Set different values for light and dark
        </InlineActionButton>
      </div>
    </Field>
  );
}

/* ─── Split-mode primitives ──────────────────────────────── */

interface ModeColorRowProps {
  icon: LucideIcon;
  modeLabel: string;
  active: boolean;
  overridden: boolean;
  onReset: () => void;
  children: ReactNode;
}

function ModeColorRow({
  icon: Icon,
  modeLabel,
  active,
  overridden,
  onReset,
  children,
}: Readonly<ModeColorRowProps>) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('size-3', active ? 'text-foreground' : 'text-muted-foreground')} />
          <span
            className={cn(
              'font-medium text-[10px] uppercase tracking-wider',
              active ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {modeLabel}
          </span>
          {overridden && (
            <span aria-label="Customized" className="size-1 rounded-full bg-primary" />
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!overridden}
          aria-label={`Reset ${modeLabel.toLowerCase()} override`}
          title={overridden ? `Reset ${modeLabel.toLowerCase()} override` : 'No override'}
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-control transition-opacity',
            overridden
              ? 'text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground'
              : 'pointer-events-none opacity-0'
          )}
        >
          <RotateCcw className="size-2.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

interface InlineActionButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}

function InlineActionButton({ icon: Icon, onClick, children }: Readonly<InlineActionButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3" />
      {children}
    </button>
  );
}
