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
  AlertCircle,
  ArrowLeft,
  BellRing,
  ChevronRight,
  ChevronsUpDown,
  Info,
  LayoutPanelTop,
  Link2,
  List,
  type LucideIcon,
  Menu,
  Moon,
  MousePointerClick,
  PanelTop,
  RectangleHorizontal,
  RotateCcw,
  SquareCheck,
  SquareStack,
  Sun,
  Tag,
  TextCursor,
  ToggleRight,
  Unlink2,
  UserCircle,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Slider, SliderValue } from '@/components/ui';
import { cn } from '@/lib/utils';
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
import {
  AlertPreview,
  AvatarPreview,
  BadgePreview,
  ButtonPreview,
  CardPreview,
  CheckboxPreview,
  DialogPreview,
  InputPreview,
  MenuItemPreview,
  MenuPreview,
  PopoverPreview,
  SelectPreview,
  SwitchPreview,
  TabsPreview,
  ToastPreview,
  TooltipPreview,
} from './components-previews';
import { ThemedSurface } from './ThemedSurface';

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
  /** System role this token falls back to when unset. */
  fallbackKey: ColorToken;
  /** Optional pair for the WCAG contrast badge. */
  pairKey?: ColorToken;
  /** i18n key into `components.pairLabels.*` */
  pairLabelKey?: string;
}

interface ComponentMeta {
  key: ComponentRadiusKey;
  /** rem offset from `theme.radius` matching the system default. */
  seedOffset: number;
  colorTokens: readonly ColorTokenMeta[];
  /** Render a live preview using the component's utility classes. */
  Preview: () => ReactNode;
}

interface ComponentGroup {
  id: string;
  items: readonly ComponentMeta[];
}

/* ─── Metadata ───────────────────────────────────────────── */

const GROUPS: readonly ComponentGroup[] = [
  {
    id: 'controls',
    items: [
      {
        key: 'button',
        seedOffset: -0.25,
        colorTokens: [
          {
            key: 'button-filled-container',
            fallbackKey: 'primary',
            pairKey: 'button-filled-label',
            pairLabelKey: 'components.pairLabels.label',
          },
          {
            key: 'button-filled-label',
            fallbackKey: 'primary-foreground',
            pairKey: 'button-filled-container',
            pairLabelKey: 'components.pairLabels.container',
          },
          {
            key: 'button-outline-border',
            fallbackKey: 'border',
          },
          {
            key: 'button-outline-label',
            fallbackKey: 'foreground',
            pairKey: 'background',
            pairLabelKey: 'components.pairLabels.surface',
          },
        ],
        Preview: ButtonPreview,
      },
      {
        key: 'input',
        seedOffset: -0.25,
        colorTokens: [
          {
            key: 'input-container',
            fallbackKey: 'background',
            pairKey: 'input-label',
            pairLabelKey: 'components.pairLabels.text',
          },
          {
            key: 'input-label',
            fallbackKey: 'foreground',
            pairKey: 'input-container',
            pairLabelKey: 'components.pairLabels.bg',
          },
          {
            key: 'input-border',
            fallbackKey: 'input',
          },
          {
            key: 'input-placeholder',
            fallbackKey: 'muted-foreground',
            pairKey: 'input-container',
            pairLabelKey: 'components.pairLabels.bg',
          },
        ],
        Preview: InputPreview,
      },
      {
        key: 'select',
        seedOffset: -0.25,
        // Shares the `input-*` token family — editing either component's
        // colour here changes both. The description in locale reflects this.
        colorTokens: [
          {
            key: 'input-container',
            fallbackKey: 'background',
            pairKey: 'input-label',
            pairLabelKey: 'components.pairLabels.text',
          },
          {
            key: 'input-label',
            fallbackKey: 'foreground',
            pairKey: 'input-container',
            pairLabelKey: 'components.pairLabels.bg',
          },
          {
            key: 'input-border',
            fallbackKey: 'input',
          },
          {
            key: 'input-placeholder',
            fallbackKey: 'muted-foreground',
            pairKey: 'input-container',
            pairLabelKey: 'components.pairLabels.bg',
          },
        ],
        Preview: SelectPreview,
      },
      {
        key: 'checkbox',
        seedOffset: -0.625,
        colorTokens: [],
        Preview: CheckboxPreview,
      },
      {
        key: 'tabs',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: TabsPreview,
      },
      {
        key: 'badge',
        seedOffset: -0.375,
        colorTokens: [],
        Preview: BadgePreview,
      },
      {
        key: 'switch',
        seedOffset: 9999,
        colorTokens: [],
        Preview: SwitchPreview,
      },
    ],
  },
  {
    id: 'surfaces',
    items: [
      {
        key: 'card',
        seedOffset: 0,
        colorTokens: [
          {
            key: 'card-container',
            fallbackKey: 'card',
            pairKey: 'card-label',
            pairLabelKey: 'components.pairLabels.label',
          },
          {
            key: 'card-label',
            fallbackKey: 'card-foreground',
            pairKey: 'card-container',
            pairLabelKey: 'components.pairLabels.bg',
          },
        ],
        Preview: CardPreview,
      },
      {
        key: 'alert',
        seedOffset: 0,
        colorTokens: [],
        Preview: AlertPreview,
      },
      {
        key: 'toast',
        seedOffset: 0,
        colorTokens: [],
        Preview: ToastPreview,
      },
      {
        key: 'avatar',
        seedOffset: 9999,
        colorTokens: [],
        Preview: AvatarPreview,
      },
    ],
  },
  {
    id: 'overlays',
    items: [
      {
        key: 'dialog',
        seedOffset: 0.25,
        colorTokens: [
          {
            key: 'dialog-container',
            fallbackKey: 'popover',
            pairKey: 'dialog-label',
            pairLabelKey: 'components.pairLabels.label',
          },
          {
            key: 'dialog-label',
            fallbackKey: 'popover-foreground',
            pairKey: 'dialog-container',
            pairLabelKey: 'components.pairLabels.bg',
          },
        ],
        Preview: DialogPreview,
      },
      {
        key: 'popover',
        seedOffset: 0.25,
        colorTokens: [],
        Preview: PopoverPreview,
      },
      {
        key: 'menu',
        seedOffset: 0.25,
        colorTokens: [],
        Preview: MenuPreview,
      },
      {
        key: 'menu-item',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: MenuItemPreview,
      },
      {
        key: 'tooltip',
        seedOffset: -0.25,
        colorTokens: [],
        Preview: TooltipPreview,
      },
    ],
  },
];

const ALL_COMPONENTS: readonly ComponentMeta[] = GROUPS.flatMap((g) => g.items);

/**
 * Visual identifier for each component in the list. Replaces the abstract
 * radius-swatch that confused people — a Lucide icon maps to a concept
 * much faster than "square with corner hint does X".
 */
const COMPONENT_ICONS: Record<ComponentRadiusKey, LucideIcon> = {
  button: MousePointerClick,
  input: TextCursor,
  select: ChevronsUpDown,
  checkbox: SquareCheck,
  tabs: LayoutPanelTop,
  badge: Tag,
  switch: ToggleRight,
  'switch-thumb': ToggleRight,
  card: RectangleHorizontal,
  alert: AlertCircle,
  toast: BellRing,
  avatar: UserCircle,
  dialog: SquareStack,
  popover: PanelTop,
  menu: Menu,
  'menu-item': List,
  tooltip: Info,
};

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
  const { t } = useTranslation('themeBuilder');
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
    <div className="space-y-4">
      <p className="px-1 text-[10px] text-muted-foreground">
        {totalOverrides > 0
          ? t('components.customized', { count: totalOverrides })
          : t('components.listHint')}
      </p>
      {GROUPS.map((group) => (
        <section key={group.id} className="space-y-2">
          <h3 className="px-1 font-semibold text-[11px] text-foreground tracking-wide">
            {t(`components.groups.${group.id}`)}
          </h3>
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
        </section>
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

function ComponentRow({ meta, draft, onSelect }: Readonly<ComponentRowProps>) {
  const { t } = useTranslation('themeBuilder');
  const overrides = countOverrides(draft, meta);
  const customized = overrides > 0;
  const Icon = COMPONENT_ICONS[meta.key];
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center gap-3 px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-control border transition-colors',
          customized
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-muted/40 text-muted-foreground group-hover:text-foreground'
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-xs">
          {t(`components.items.${meta.key}.label`)}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {t(`components.items.${meta.key}.description`)}
        </div>
      </div>
      {customized && (
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-medium font-mono text-[9px] text-primary tabular-nums">
          {overrides}
        </span>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
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
  const { t } = useTranslation('themeBuilder');
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

  // Esc returns to the list. Only active while the detail view is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="-mx-1 flex items-center gap-1.5 rounded-control px-1 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider transition-colors hover:text-foreground"
          aria-label={t('components.backLabel')}
        >
          <ArrowLeft className="size-3" />
          <span>{t('components.backShort', { defaultValue: t('components.backLabel') })}</span>
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="truncate font-semibold text-base">
              {t(`components.items.${meta.key}.label`)}
            </h2>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t(`components.items.${meta.key}.description`)}
            </p>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={onResetAll}
            disabled={totalOverrides === 0}
            className="shrink-0"
          >
            <RotateCcw />
            {totalOverrides > 0
              ? t('components.resetCount', {
                  count: totalOverrides,
                  defaultValue: t('components.resetAll'),
                })
              : t('components.resetAll')}
          </Button>
        </div>
      </header>

      <PreviewStage draft={draft} mode={mode} onModeChange={setMode}>
        <Preview />
      </PreviewStage>

      <DetailGroup label={t('components.shape')}>
        <Field
          label={t('components.radius')}
          hint="rem"
          overridden={radiusOverridden}
          onReset={() => onTokenChange(meta.key, 'radius', undefined)}
        >
          <div className="flex items-center gap-2">
            <Slider
              value={effectiveRadius}
              onChange={(v) => onTokenChange(meta.key, 'radius', v)}
              min={0}
              max={RADIUS_SLIDER_MAX}
              step={0.125}
              className="flex-1"
            />
            <SliderValue
              value={effectiveRadius}
              onChange={(v) => onTokenChange(meta.key, 'radius', v)}
              min={0}
              max={RADIUS_SLIDER_MAX}
              step={0.125}
              unit="rem"
              width="w-14"
              decimals={3}
            />
          </div>
        </Field>
        <Field
          label={t('components.corners')}
          hint={cornersOverridden ? t('components.cornersCustom') : t('components.cornersTheme')}
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
        <DetailGroup label={t('components.colors')} hint={t('components.colorsHint')}>
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
          {t('components.noColorOverrides')}
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
  /** Optional slot rendered between the label and the reset button (e.g. link/unlink toggle). */
  headerExtra?: ReactNode;
  children: ReactNode;
}

function Field({ label, hint, overridden, onReset, headerExtra, children }: Readonly<FieldProps>) {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-xs">{label}</span>
          {overridden && (
            <span
              aria-label={t('components.customizedLabel')}
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
          {headerExtra}
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
  const { t } = useTranslation('themeBuilder');
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={!overridden}
      aria-label={t('components.resetAria', { field: label.toLowerCase() })}
      title={overridden ? t('components.resetTitle') : t('components.matchesTheme')}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-control transition-[opacity,background-color,color]',
        overridden
          ? 'text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground'
          : 'pointer-events-none text-muted-foreground/40'
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
  const { t } = useTranslation('themeBuilder');
  const lightValue = draft.colors.light[token.key];
  const darkValue = draft.colors.dark[token.key];
  const hasLight = lightValue !== undefined;
  const hasDark = darkValue !== undefined;
  const overridden = hasLight || hasDark;
  const naturallySplit = hasLight && hasDark && lightValue !== darkValue;
  const [userExpanded, setUserExpanded] = useState(false);
  const split = naturallySplit || userExpanded;

  const label = t(`components.colorTokens.${token.key}.label`, { defaultValue: token.key });
  const fallbackLabel = t(`components.fallbackLabels.${token.fallbackKey}`, {
    defaultValue: token.fallbackKey,
  });
  const pairLabel = token.pairLabelKey ? t(token.pairLabelKey) : undefined;

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

  const splitToggle = (
    <SplitToggle
      split={split}
      onToggle={() => {
        if (split) {
          unify();
        } else {
          setUserExpanded(true);
        }
      }}
    />
  );

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
      <Field
        label={label}
        hint={t('components.perMode')}
        overridden={overridden}
        onReset={resetAll}
        headerExtra={splitToggle}
      >
        <div className="space-y-2">
          <ModeColorRow
            icon={Sun}
            modeLabel={t('components.modeLight')}
            active={mode === 'light'}
            overridden={hasLight}
            onReset={() => onChange(token.key, 'light', undefined)}
          >
            <ColorField
              label={`${label} (${t('components.modeLight')})`}
              value={lightEff}
              onChange={(v) => onChange(token.key, 'light', v)}
              pairWith={pairLight}
              pairLabel={pairLabel}
            />
          </ModeColorRow>
          <ModeColorRow
            icon={Moon}
            modeLabel={t('components.modeDark')}
            active={mode === 'dark'}
            overridden={hasDark}
            onReset={() => onChange(token.key, 'dark', undefined)}
          >
            <ColorField
              label={`${label} (${t('components.modeDark')})`}
              value={darkEff}
              onChange={(v) => onChange(token.key, 'dark', v)}
              pairWith={pairDark}
              pairLabel={pairLabel}
            />
          </ModeColorRow>
        </div>
      </Field>
    );
  }

  const paletteForMode = mode === 'light' ? draft.colors.light : draft.colors.dark;
  const currentValue = paletteForMode[token.key] ?? resolveColor(paletteForMode, token.fallbackKey);
  const pairForMode = token.pairKey
    ? (paletteForMode[token.pairKey] ?? resolveColor(paletteForMode, token.pairKey))
    : undefined;

  const hint = overridden
    ? t('components.shared')
    : t('components.themeFallback', { label: fallbackLabel });

  return (
    <Field
      label={label}
      hint={hint}
      overridden={overridden}
      onReset={resetAll}
      headerExtra={splitToggle}
    >
      <ColorField
        label={label}
        value={currentValue}
        onChange={(v) => onChange(token.key, 'both', v)}
        pairWith={pairForMode}
        pairLabel={pairLabel}
      />
    </Field>
  );
}

/**
 * Small icon toggle to switch between "one colour shared across light & dark"
 * and "two separate per-mode values". Sits next to the reset button in the
 * field header — no full-width action rows needed.
 */
interface SplitToggleProps {
  split: boolean;
  onToggle: () => void;
}

function SplitToggle({ split, onToggle }: Readonly<SplitToggleProps>) {
  const { t } = useTranslation('themeBuilder');
  const Icon = split ? Link2 : Unlink2;
  const title = split ? t('components.useOneValue') : t('components.setDifferentValues');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={title}
      title={title}
      className="flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-[color,background-color] hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3" />
    </button>
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
  const { t } = useTranslation('themeBuilder');
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
            <span
              aria-label={t('components.customizedLabel')}
              className="size-1 rounded-full bg-primary"
            />
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!overridden}
          aria-label={t('components.resetModeAria', { mode: modeLabel.toLowerCase() })}
          title={
            overridden
              ? t('components.resetModeTitle', { mode: modeLabel.toLowerCase() })
              : t('components.noOverride')
          }
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-control transition-[opacity,background-color,color]',
            overridden
              ? 'text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground'
              : 'pointer-events-none text-muted-foreground/40'
          )}
        >
          <RotateCcw className="size-2.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
