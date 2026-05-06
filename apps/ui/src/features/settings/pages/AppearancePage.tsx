import { Badge, Button, Card, cn } from '@brika/clay';
import type { ThemeConfig as ClayThemeConfig, ThemeColors, ThemeMode } from '@brika/clay/themes';
import { ThemeScope } from '@brika/clay/themes';
import { builtInThemes } from '@brika/clay/themes/registry';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Check,
  type LucideIcon,
  Monitor,
  Moon,
  Palette,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useCustomThemes } from '@/features/theme-builder/hooks';
import { customThemeSelector } from '@/features/theme-builder/runtime';
import { useTheme } from '@/lib/theme-context';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import { PageHeader, SettingsSection } from './primitives';

export function AppearancePage() {
  const { t } = useLocale();
  const { theme, mode, resolvedMode, setTheme, setMode } = useTheme();
  const customThemes = useCustomThemes();

  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.preferences')}
        title={t('settings:appearance.title')}
        description={t('settings:appearance.description')}
      />

      <div className="space-y-4">
        {/* ─── Color theme ─────────────────────────────────────────────── */}
        <SettingsSection
          icon={Palette}
          title={t('settings:appearance.theme.title')}
          description={t('settings:appearance.theme.description')}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {builtInThemes.map((cfg) => (
              <ThemeCard
                key={cfg.id}
                theme={cfg}
                mode={resolvedMode}
                selected={theme === cfg.id}
                onSelect={(target) => setTheme(cfg.id, target)}
              />
            ))}
          </div>
        </SettingsSection>

        {/* ─── Color mode ──────────────────────────────────────────────── */}
        <SettingsSection
          icon={Monitor}
          title={t('settings:appearance.mode.title')}
          description={t('settings:appearance.mode.description')}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {MODE_OPTIONS.map((option) => (
              <ModeCard
                key={option.value}
                option={option}
                selected={mode === option.value}
                onSelect={(e) => setMode(option.value, e)}
                label={t(`settings:modes.${option.value}`)}
                description={t(`settings:appearance.mode.${option.value}Description`)}
              />
            ))}
          </div>
        </SettingsSection>

        {/* ─── Custom themes & builder ─────────────────────────────────── */}
        <SettingsSection
          icon={Sparkles}
          title={t('settings:appearance.custom.title')}
          description={t('settings:appearance.custom.description')}
          actions={
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to={paths.settings.themes.path}>
                <Sparkles className="size-3.5" />
                {t('settings:appearance.custom.openBuilder')}
              </Link>
            </Button>
          }
        >
          {customThemes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border/50 border-dashed bg-foreground/[0.015] px-6 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-foreground/[0.04] text-muted-foreground">
                <Sparkles className="size-4" />
              </div>
              <p className="max-w-[320px] text-[12.5px] text-muted-foreground leading-relaxed">
                {t('settings:appearance.custom.empty')}
              </p>
              <Button asChild size="sm" className="mt-1 gap-1.5">
                <Link to={paths.settings.themes.path}>
                  {t('settings:appearance.custom.createCta')}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {customThemes.map((ct) => {
                const selectorId = customThemeSelector(ct.id);
                return (
                  <ThemeCard
                    key={ct.id}
                    theme={ct}
                    mode={resolvedMode}
                    selected={theme === selectorId}
                    onSelect={(target) => setTheme(selectorId, target)}
                  />
                );
              })}
            </div>
          )}
        </SettingsSection>
      </div>
    </>
  );
}

// ─── Mode option config ─────────────────────────────────────────────────────

interface ModeOption {
  value: 'light' | 'dark' | 'system';
  icon: LucideIcon;
}

const MODE_OPTIONS: readonly ModeOption[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

// ─── Theme card ─────────────────────────────────────────────────────────────

/** Permissive shape: matches both clay's built-in themes and custom themes. */
type LooseTokenMap = Readonly<Record<string, string | undefined>>;

interface ThemeLike {
  id: string;
  name: string;
  description?: string;
  accentSwatches?: readonly string[];
  colors?: { light?: LooseTokenMap; dark?: LooseTokenMap };
}

interface ThemeCardProps {
  theme: ThemeLike;
  mode: ThemeMode;
  selected: boolean;
  onSelect: (target: Element | null) => void;
}

function ThemeCard({ theme, mode, selected, onSelect }: Readonly<ThemeCardProps>) {
  const { t } = useLocale();
  const displayName = t(`settings:themes.${theme.id}`, { defaultValue: theme.name });
  const clayTheme = toClayTheme(theme);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => onSelect(e.currentTarget);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(e.currentTarget);
    }
  };

  return (
    <Card
      interactive
      role="radio"
      aria-checked={selected}
      aria-label={displayName}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex cursor-pointer flex-col gap-2.5 p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'border-primary/60 ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
      )}
    >
      <ThemePreview theme={clayTheme} mode={mode} />

      <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
        <span className="truncate font-medium text-[13.5px] text-foreground">{displayName}</span>
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors',
            selected ? 'bg-primary text-primary-foreground' : 'bg-foreground/5 text-transparent'
          )}
        >
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      </div>
    </Card>
  );
}

// ─── Theme preview using ThemeScope + REAL clay components ─────────────────
// Inside the scope, every clay primitive (Card, Button, Badge…) automatically
// picks up the previewed theme — so the preview also reflects component-level
// tokens like button radius, card shadow, border style, motion, etc.

function ThemePreview({ theme, mode }: Readonly<{ theme: ClayThemeConfig; mode: ThemeMode }>) {
  return (
    <ThemeScope theme={theme} mode={mode}>
      <div className="flex aspect-[4/2.4] flex-col gap-1.5 overflow-hidden rounded-md border border-border bg-background p-2 text-foreground">
        {/* Title-bar: real clay badges in feedback colours */}
        <div className="flex items-center gap-1">
          <Badge
            variant="destructive"
            className="h-1.5 w-1.5 min-w-0 rounded-full p-0 ring-0"
            aria-hidden
          >
            <span className="sr-only">.</span>
          </Badge>
          <span aria-hidden className="size-1.5 rounded-full bg-warning" />
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
        </div>

        {/* Inner real clay Card with text bars + a real Button */}
        <Card className="flex flex-1 flex-col justify-between gap-1.5 p-1.5 shadow-none">
          <div className="space-y-1">
            <div className="h-1 w-2/3 rounded-full bg-foreground/80" />
            <div className="h-1 w-1/2 rounded-full bg-muted-foreground/60" />
          </div>
          <div className="flex items-end justify-between gap-1">
            <div className="h-1 w-1/3 rounded-full bg-muted-foreground/40" />
            <Button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none h-3 min-w-0 px-1 py-0 text-[7px] leading-none"
            >
              Aa
            </Button>
          </div>
        </Card>
      </div>
    </ThemeScope>
  );
}

// ─── Mode card ──────────────────────────────────────────────────────────────

interface ModeCardProps {
  option: ModeOption;
  selected: boolean;
  onSelect: (event: MouseEvent<HTMLElement>) => void;
  label: string;
  description: string;
}

function ModeCard({ option, selected, onSelect, label, description }: Readonly<ModeCardProps>) {
  const Icon = option.icon;

  const handleClick = (e: MouseEvent<HTMLDivElement>) => onSelect(e);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(e as unknown as MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <Card
      interactive
      role="radio"
      aria-checked={selected}
      aria-label={label}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex cursor-pointer flex-col items-start gap-2.5 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'border-primary/60 ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-md transition-colors',
            selected ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.05] text-muted-foreground'
          )}
        >
          <Icon className="size-4" />
        </div>
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors',
            selected ? 'bg-primary text-primary-foreground' : 'bg-foreground/5 text-transparent'
          )}
        >
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      </div>
      <div className="space-y-0.5">
        <div className="font-medium text-[13.5px] text-foreground">{label}</div>
        <div className="text-[11.5px] text-muted-foreground">{description}</div>
      </div>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Adapt either a clay built-in theme or a theme-builder custom theme into a
 * structurally-compatible clay `ThemeConfig` for `ThemeScope` to consume.
 * `ThemeScope` only reads `id`, `name` and `colors`; the remaining fields are
 * structural fillers for the type signature.
 */
function toClayTheme(theme: ThemeLike): ClayThemeConfig {
  const description = typeof theme.description === 'string' ? theme.description : '';
  return {
    id: theme.id,
    name: theme.name,
    description,
    accentSwatches: theme.accentSwatches ?? [],
    colors: normalizeColors(theme.colors),
  };
}

/**
 * Bridge custom-theme color shapes (which allow undefined entries) onto the
 * structurally-stricter clay `ThemeColors`. `ThemeScope` only reads defined
 * entries so the runtime is safe; this cast exists purely to satisfy the
 * stricter clay type signature.
 */
function normalizeColors(colors: ThemeLike['colors']): ThemeColors | undefined {
  if (!colors) {
    return undefined;
  }
  return colors as unknown as ThemeColors;
}
