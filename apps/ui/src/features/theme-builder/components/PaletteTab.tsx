/**
 * PaletteTab — search + light/dark switch + sync menu over the token
 * list. All color-editing logic lives here so ControlsPanel is pure
 * layout wiring.
 */

import { ArrowLeftRight, Search, Sparkles, SunMoon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { invertLightness, mix, parseHex, shiftLightness } from '../color-utils';
import { TOKEN_GROUPS } from '../tokens';
import { metaFor } from '../tokens-meta';
import type { ColorToken, ThemeColors, ThemeConfig } from '../types';
import { ColorField } from './ColorField';

const FOREGROUND_PAIRS: Partial<Record<ColorToken, { token: ColorToken; labelKey: string }>> = {
  foreground: { token: 'background', labelKey: 'foregroundPairs.onBackground' },
  'card-foreground': { token: 'card', labelKey: 'foregroundPairs.onCard' },
  'popover-foreground': { token: 'popover', labelKey: 'foregroundPairs.onPopover' },
  'primary-foreground': { token: 'primary', labelKey: 'foregroundPairs.onPrimary' },
  'secondary-foreground': { token: 'secondary', labelKey: 'foregroundPairs.onSecondary' },
  'accent-foreground': { token: 'accent', labelKey: 'foregroundPairs.onAccent' },
  'muted-foreground': { token: 'muted', labelKey: 'foregroundPairs.onMuted' },
  'success-foreground': { token: 'success', labelKey: 'foregroundPairs.onSuccess' },
  'warning-foreground': { token: 'warning', labelKey: 'foregroundPairs.onWarning' },
  'info-foreground': { token: 'info', labelKey: 'foregroundPairs.onInfo' },
  'destructive-foreground': { token: 'destructive', labelKey: 'foregroundPairs.onDestructive' },
};

interface PaletteTabProps {
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

export function PaletteTab({ draft, onChange }: Readonly<PaletteTabProps>) {
  const { t } = useTranslation('themeBuilder');
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>('light');
  const [query, setQuery] = useState('');

  const palette = draft.colors[editingMode];

  const updateColor = (token: ColorToken, value: string) => {
    const next: ThemeColors = { ...palette, [token]: value };
    onChange({
      ...draft,
      colors: { ...draft.colors, [editingMode]: next },
    });
  };

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
    const inverted: ThemeColors = { ...src };
    for (const [key, value] of Object.entries(src)) {
      if (typeof value === 'string') {
        Reflect.set(inverted, key, invertLightness(value));
      }
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
    <>
      <div className="shrink-0 space-y-2 border-b px-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('palette.filterPlaceholder')}
              className="h-7 py-1 pr-2 pl-7 text-[11px]"
            />
          </div>
          <Tabs value={editingMode} onValueChange={(v) => setEditingMode(v as 'light' | 'dark')}>
            <TabsList className="h-7">
              <TabsTrigger value="light" className="h-6 px-2 text-[10px]">
                {t('palette.modeLight')}
              </TabsTrigger>
              <TabsTrigger value="dark" className="h-6 px-2 text-[10px]">
                {t('palette.modeDark')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]">
                <SunMoon className="size-3" /> {t('palette.sync')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="text-xs">
              <DropdownMenuItem onSelect={() => copyMode('light')}>
                <ArrowLeftRight className="size-3" />
                {t('palette.copyLightToDark')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copyMode('dark')}>
                <ArrowLeftRight className="size-3" />
                {t('palette.copyDarkToLight')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => autoInvertTo('dark')}>
                <SunMoon className="size-3" />
                {t('palette.autoInvertToDark')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => autoInvertTo('light')}>
                <SunMoon className="size-3" />
                {t('palette.autoInvertToLight')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            onClick={generateNeutrals}
            title={t('palette.tintFromPrimaryTooltip')}
            className="h-6 gap-1 px-1.5 text-[10px]"
          >
            <Sparkles className="size-3" />
            {t('palette.tintFromPrimary')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {filteredGroups.length === 0 && (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {t('palette.emptyFilter', { query })}
          </div>
        )}
        {filteredGroups.map((group) => (
          <div key={group.key} className="space-y-1.5">
            <div className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
              {t(`groups.${group.key}`, { defaultValue: group.key })}
            </div>
            <div className="space-y-1">
              {group.tokens.map((token) => {
                const pair = FOREGROUND_PAIRS[token];
                const meta = metaFor(token);
                const description = t(`tokens.${token}.purpose`, {
                  defaultValue: meta?.purpose ?? '',
                });
                return (
                  <ColorField
                    key={token}
                    label={token}
                    value={palette[token] ?? ''}
                    onChange={(v) => updateColor(token, v)}
                    pairWith={pair ? palette[pair.token] : undefined}
                    pairLabel={pair ? t(pair.labelKey) : undefined}
                    description={description || undefined}
                    example={meta?.example}
                    cssVar={meta?.cssVar}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
