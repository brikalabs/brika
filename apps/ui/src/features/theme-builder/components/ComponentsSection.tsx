/**
 * ComponentsSection — per-component token editor.
 *
 * The list view groups components by role (Controls / Surfaces / Overlays /
 * …). Selecting a row opens a detail view that lists EVERY clay Layer-2
 * token the component exposes, grouped by category (color, geometry,
 * border, typography, elevation, focus, motion, state).
 *
 * The component list and the per-component token surface are derived from
 * `@brika/clay`'s TOKEN_REGISTRY (via `clay-tokens.ts`) — there's no
 * hand-curated list to keep in sync.
 */

import { Button, cn } from '@brika/clay';
import type { ResolvedTokenSpec, TokenCategory } from '@brika/clay/tokens';
import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  Box,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Image,
  Info,
  Key,
  LayoutPanelLeft,
  LayoutPanelTop,
  type LucideIcon,
  Menu,
  Minus,
  Moon,
  MousePointerClick,
  PanelLeft,
  PanelTop,
  RectangleHorizontal,
  RotateCcw,
  Rows3,
  Shapes,
  SlidersHorizontal,
  SquareCheck,
  SquareStack,
  Sun,
  Tag,
  TextCursor,
  ToggleRight,
  Type,
  UserCircle,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_ORDER, COMPONENT_TOKEN_INDEX, tokensByCategoryFor } from '../clay-tokens';
import type { ComponentRadiusKey, ComponentTokens, ThemeColors, ThemeConfig } from '../types';
import {
  AlertPreview,
  AvatarPreview,
  BadgePreview,
  ButtonPreview,
  CardPreview,
  CheckboxPreview,
  CodeBlockPreview,
  DialogPreview,
  IconPreview,
  InputPreview,
  MenuItemPreview,
  MenuPreview,
  PasswordInputPreview,
  PopoverPreview,
  ProgressPreview,
  SelectPreview,
  SeparatorPreview,
  SheetPreview,
  SidebarPreview,
  SliderPreview,
  SwitchPreview,
  SwitchThumbPreview,
  TablePreview,
  TabsPreview,
  TextareaPreview,
  ToastPreview,
  TooltipPreview,
} from './components-previews';
import { ThemedSurface } from './ThemedSurface';
import { TokenField } from './TokenField';

type PreviewMode = 'light' | 'dark';

type ColorSlot = 'light' | 'dark' | 'both';
type ColorSetter = (token: string, slot: ColorSlot, value: string | undefined) => void;
type ComponentTokenSetter = (component: string, suffix: string, value: string | undefined) => void;

/* ─── Per-component identity (icon + group + preview) ────────── */

interface ComponentIdentity {
  key: string;
  icon: LucideIcon;
  Preview?: () => ReactNode;
}

const IDENTITY: Record<string, Omit<ComponentIdentity, 'key'>> = {
  alert: { icon: AlertCircle, Preview: AlertPreview },
  avatar: { icon: UserCircle, Preview: AvatarPreview },
  badge: { icon: Tag, Preview: BadgePreview },
  button: { icon: MousePointerClick, Preview: ButtonPreview },
  card: { icon: RectangleHorizontal, Preview: CardPreview },
  checkbox: { icon: SquareCheck, Preview: CheckboxPreview },
  'code-block': { icon: Code2, Preview: CodeBlockPreview },
  dialog: { icon: SquareStack, Preview: DialogPreview },
  icon: { icon: Image, Preview: IconPreview },
  input: { icon: TextCursor, Preview: InputPreview },
  menu: { icon: Menu, Preview: MenuPreview },
  'menu-item': { icon: Rows3, Preview: MenuItemPreview },
  'password-input': { icon: Key, Preview: PasswordInputPreview },
  popover: { icon: PanelTop, Preview: PopoverPreview },
  progress: { icon: SlidersHorizontal, Preview: ProgressPreview },
  select: { icon: ChevronsUpDown, Preview: SelectPreview },
  separator: { icon: Minus, Preview: SeparatorPreview },
  sheet: { icon: LayoutPanelLeft, Preview: SheetPreview },
  sidebar: { icon: PanelLeft, Preview: SidebarPreview },
  slider: { icon: SlidersHorizontal, Preview: SliderPreview },
  switch: { icon: ToggleRight, Preview: SwitchPreview },
  'switch-thumb': { icon: ToggleRight, Preview: SwitchThumbPreview },
  table: { icon: Rows3, Preview: TablePreview },
  tabs: { icon: LayoutPanelTop, Preview: TabsPreview },
  textarea: { icon: TextCursor, Preview: TextareaPreview },
  toast: { icon: BellRing, Preview: ToastPreview },
  tooltip: { icon: Info, Preview: TooltipPreview },
};

const FALLBACK_IDENTITY: Omit<ComponentIdentity, 'key'> = { icon: Box };

function identityFor(component: string): ComponentIdentity {
  const m = IDENTITY[component] ?? FALLBACK_IDENTITY;
  return { key: component, ...m };
}

/* ─── Group layout (curated for UX) ──────────────────────────── */

const GROUP_ORDER: readonly { id: string; members: readonly string[] }[] = [
  {
    id: 'controls',
    members: [
      'button',
      'input',
      'textarea',
      'password-input',
      'select',
      'checkbox',
      'switch',
      'switch-thumb',
      'tabs',
      'badge',
      'slider',
    ],
  },
  {
    id: 'surfaces',
    members: ['card', 'alert', 'toast', 'avatar', 'separator', 'progress', 'code-block', 'icon'],
  },
  {
    id: 'overlays',
    members: ['dialog', 'sheet', 'popover', 'menu', 'menu-item', 'tooltip'],
  },
  {
    id: 'layout',
    members: ['sidebar', 'table'],
  },
];

function buildGroups(): readonly { id: string; items: readonly ComponentIdentity[] }[] {
  const seen = new Set<string>();
  const out: { id: string; items: ComponentIdentity[] }[] = [];
  for (const g of GROUP_ORDER) {
    const items: ComponentIdentity[] = [];
    for (const name of g.members) {
      if (COMPONENT_TOKEN_INDEX[name]) {
        items.push(identityFor(name));
        seen.add(name);
      }
    }
    if (items.length > 0) {
      out.push({ id: g.id, items });
    }
  }
  // Anything clay defines that the curated groups missed: bucket under "other".
  const leftover = Object.keys(COMPONENT_TOKEN_INDEX).filter((n) => !seen.has(n));
  if (leftover.length > 0) {
    out.push({
      id: 'other',
      items: leftover.toSorted((a, b) => a.localeCompare(b)).map(identityFor),
    });
  }
  return out;
}

const GROUPS = buildGroups();

/* ─── Override counting ─────────────────────────────────────── */

function countOverrides(draft: ThemeConfig, component: string): number {
  const tokens = COMPONENT_TOKEN_INDEX[component] ?? [];
  let count = 0;
  for (const spec of tokens) {
    if (spec.type === 'color') {
      if (
        draft.colors.light[spec.name] !== undefined ||
        draft.colors.dark[spec.name] !== undefined
      ) {
        count += 1;
      }
    } else {
      const suffix = spec.name.replace(`${component}-`, '');
      if (draft.componentTokens?.[component]?.[suffix] !== undefined) {
        count += 1;
      }
    }
  }
  return count;
}

/* ─── Section ────────────────────────────────────────────────── */

interface ComponentsSectionProps {
  draft: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}

export function ComponentsSection({ draft, onChange }: Readonly<ComponentsSectionProps>) {
  const { t } = useTranslation('themeBuilder');
  const [selected, setSelected] = useState<string | null>(null);

  const setComponentToken = useCallback<ComponentTokenSetter>(
    (component, suffix, value) => {
      const nextTokens: Record<string, ComponentTokens> = { ...draft.componentTokens };
      const current: ComponentTokens = { ...nextTokens[component] };
      if (value === undefined) {
        delete current[suffix];
      } else {
        current[suffix] = value;
      }
      if (Object.keys(current).length === 0) {
        delete nextTokens[component];
      } else {
        nextTokens[component] = current;
      }
      onChange({
        ...draft,
        componentTokens:
          Object.keys(nextTokens).length === 0
            ? undefined
            : (nextTokens as Record<ComponentRadiusKey, ComponentTokens>),
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
          (light as Record<string, string>)[token] = value;
        }
      }
      if (slot === 'dark' || slot === 'both') {
        if (value === undefined) {
          delete dark[token];
        } else {
          (dark as Record<string, string>)[token] = value;
        }
      }
      onChange({ ...draft, colors: { light: light as ThemeColors, dark: dark as ThemeColors } });
    },
    [draft, onChange]
  );

  const resetComponent = useCallback(
    (component: string) => {
      const tokens = COMPONENT_TOKEN_INDEX[component] ?? [];
      const nextTokens = { ...draft.componentTokens };
      delete nextTokens[component];
      const light = { ...draft.colors.light };
      const dark = { ...draft.colors.dark };
      for (const spec of tokens) {
        if (spec.type === 'color') {
          delete light[spec.name];
          delete dark[spec.name];
        }
      }
      onChange({
        ...draft,
        componentTokens:
          Object.keys(nextTokens).length === 0
            ? undefined
            : (nextTokens as Record<ComponentRadiusKey, ComponentTokens>),
        colors: { light: light as ThemeColors, dark: dark as ThemeColors },
      });
    },
    [draft, onChange]
  );

  if (selected) {
    return (
      <ComponentDetail
        component={selected}
        draft={draft}
        onBack={() => setSelected(null)}
        onColorChange={setColor}
        onTokenChange={setComponentToken}
        onResetAll={() => resetComponent(selected)}
      />
    );
  }

  const totalOverrides = GROUPS.reduce(
    (sum, group) =>
      sum + group.items.reduce((acc, item) => acc + countOverrides(draft, item.key), 0),
    0
  );

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
            {t(`components.groups.${group.id}`, { defaultValue: group.id })}
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

/* ─── Row ────────────────────────────────────────────────────── */

interface ComponentRowProps {
  meta: ComponentIdentity;
  draft: ThemeConfig;
  onSelect: () => void;
}

function ComponentRow({ meta, draft, onSelect }: Readonly<ComponentRowProps>) {
  const { t } = useTranslation('themeBuilder');
  const overrides = countOverrides(draft, meta.key);
  const customized = overrides > 0;
  const Icon = meta.icon;
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
          {t(`components.items.${meta.key}.label`, { defaultValue: meta.key })}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {t(`components.items.${meta.key}.description`, {
            defaultValue: t('components.tokenCount', {
              count: COMPONENT_TOKEN_INDEX[meta.key]?.length ?? 0,
              defaultValue: `${COMPONENT_TOKEN_INDEX[meta.key]?.length ?? 0} tokens`,
            }),
          })}
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

/* ─── Detail ─────────────────────────────────────────────────── */

interface ComponentDetailProps {
  component: string;
  draft: ThemeConfig;
  onBack: () => void;
  onColorChange: ColorSetter;
  onTokenChange: ComponentTokenSetter;
  onResetAll: () => void;
}

const CATEGORY_ICONS: Record<TokenCategory, LucideIcon> = {
  color: Shapes,
  geometry: Box,
  border: RectangleHorizontal,
  typography: Type,
  elevation: SquareStack,
  focus: AlertCircle,
  motion: SlidersHorizontal,
  state: ToggleRight,
};

function ComponentDetail({
  component,
  draft,
  onBack,
  onColorChange,
  onTokenChange,
  onResetAll,
}: Readonly<ComponentDetailProps>) {
  const { t } = useTranslation('themeBuilder');
  const [mode, setMode] = useState<PreviewMode>('light');
  const totalOverrides = countOverrides(draft, component);
  const grouped = tokensByCategoryFor(component);
  const meta = identityFor(component);
  const Preview = meta.Preview;

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
              {t(`components.items.${component}.label`, { defaultValue: component })}
            </h2>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t(`components.items.${component}.description`, {
                defaultValue: t('components.tokenCount', {
                  count: COMPONENT_TOKEN_INDEX[component]?.length ?? 0,
                  defaultValue: `${COMPONENT_TOKEN_INDEX[component]?.length ?? 0} tokens`,
                }),
              })}
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
        {Preview ? <Preview /> : <PreviewPlaceholder />}
      </PreviewStage>

      {CATEGORY_ORDER.map((category) => {
        const tokens = grouped[category];
        if (!tokens || tokens.length === 0) {
          return null;
        }
        return (
          <CategorySection key={category} category={category}>
            {tokens.map((spec) => (
              <TokenRow
                key={spec.name}
                spec={spec}
                draft={draft}
                mode={mode}
                onColorChange={onColorChange}
                onTokenChange={onTokenChange}
              />
            ))}
          </CategorySection>
        );
      })}
    </div>
  );
}

function PreviewPlaceholder() {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="text-center text-[10px] text-muted-foreground">
      {t('components.noPreview', { defaultValue: 'Preview unavailable for this component' })}
    </div>
  );
}

/* ─── Category section ───────────────────────────────────────── */

interface CategorySectionProps {
  category: TokenCategory;
  children: ReactNode;
}

function CategorySection({ category, children }: Readonly<CategorySectionProps>) {
  const { t } = useTranslation('themeBuilder');
  const Icon = CATEGORY_ICONS[category];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="size-3 text-muted-foreground" />
        <span className="font-semibold text-[11px] uppercase tracking-wider">
          {t(`components.categories.${category}`, { defaultValue: category })}
        </span>
      </div>
      <div className="space-y-3 rounded-container border p-3">{children}</div>
    </section>
  );
}

/* ─── Token row ──────────────────────────────────────────────── */

interface TokenRowProps {
  spec: ResolvedTokenSpec;
  draft: ThemeConfig;
  mode: PreviewMode;
  onColorChange: ColorSetter;
  onTokenChange: ComponentTokenSetter;
}

function TokenRow({ spec, draft, mode, onColorChange, onTokenChange }: Readonly<TokenRowProps>) {
  const overridden = isOverridden(spec, draft);
  const reset = useCallback(() => {
    if (spec.type === 'color') {
      onColorChange(spec.name, 'both', undefined);
    } else if (spec.appliesTo) {
      const suffix = spec.name.replace(`${spec.appliesTo}-`, '');
      onTokenChange(spec.appliesTo, suffix, undefined);
    }
  }, [spec, onColorChange, onTokenChange]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <code className="truncate font-mono text-[10px] text-muted-foreground">{spec.name}</code>
          {overridden && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!overridden}
          aria-label="Reset"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-control transition-[opacity,background-color,color]',
            overridden
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'pointer-events-none text-muted-foreground/40'
          )}
        >
          <RotateCcw className="size-3" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">{spec.description}</p>
      <TokenField
        spec={spec}
        draft={draft}
        mode={mode}
        onColorChange={onColorChange}
        onTokenChange={onTokenChange}
      />
    </div>
  );
}

function isOverridden(spec: ResolvedTokenSpec, draft: ThemeConfig): boolean {
  if (spec.type === 'color') {
    return (
      draft.colors.light[spec.name] !== undefined || draft.colors.dark[spec.name] !== undefined
    );
  }
  if (!spec.appliesTo) {
    return false;
  }
  const suffix = spec.name.replace(`${spec.appliesTo}-`, '');
  return draft.componentTokens?.[spec.appliesTo]?.[suffix] !== undefined;
}

/* ─── Preview stage ──────────────────────────────────────────── */

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
