import { Link } from '@tanstack/react-router';
import { Monitor, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCustomThemes } from '@/features/theme-builder/hooks';
import { customThemeSelector } from '@/features/theme-builder/runtime';
import { BUILT_IN_THEMES, type ThemeMode, useTheme } from '@/lib/theme-context';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';

const MODE_OPTIONS: { value: ThemeMode; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

export function ThemeSelector() {
  const { theme, mode, setTheme, setMode } = useTheme();
  const { t } = useLocale();
  const customThemes = useCustomThemes();

  return (
    <div className="flex items-center gap-3">
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t('settings:themes.builtIn', { defaultValue: 'Built-in' })}</SelectLabel>
            {BUILT_IN_THEMES.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`settings:themes.${key}`)}
              </SelectItem>
            ))}
          </SelectGroup>

          {customThemes.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1">
                  <Sparkles className="size-3" />
                  {t('settings:themes.custom', { defaultValue: 'Custom' })}
                </SelectLabel>
                {customThemes.map((ct) => (
                  <SelectItem key={ct.id} value={customThemeSelector(ct.id)}>
                    {ct.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>

      <Button asChild size="sm" variant="outline">
        <Link to={paths.settings.themes.path}>
          <Palette />
          {t('settings:themes.customize', { defaultValue: 'Customize' })}
        </Link>
      </Button>

      <div className="flex gap-1 rounded-lg border p-1">
        {MODE_OPTIONS.map(({ value, icon: Icon }) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            onClick={(e) => setMode(value, e)}
            aria-label={t(`settings:modes.${value}`)}
            className={cn('h-7 px-2.5', mode === value && 'bg-accent')}
          >
            <Icon className="size-4" />
          </Button>
        ))}
      </div>
    </div>
  );
}
