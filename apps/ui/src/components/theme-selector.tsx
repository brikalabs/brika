import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ThemeMode, useTheme } from '@/lib/theme-context';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const THEME_KEYS = ['default', 'ocean', 'forest', 'sunset', 'lavender', 'ruby'] as const;

const MODE_OPTIONS: { value: ThemeMode; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

export function ThemeSelector() {
  const { theme, mode, setTheme, setMode } = useTheme();
  const { t } = useLocale();

  return (
    <div className="flex items-center gap-3">
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEME_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {t(`settings:themes.${key}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
