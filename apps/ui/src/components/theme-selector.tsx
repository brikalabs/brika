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
import { cn } from '@/lib/utils';

const THEME_LABELS: Record<string, string> = {
  default: 'Default',
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
  lavender: 'Lavender',
  ruby: 'Ruby',
};

const MODE_OPTIONS: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

export function ThemeSelector() {
  const { theme, mode, setTheme, setMode } = useTheme();

  return (
    <div className="flex items-center gap-3">
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(THEME_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1 rounded-lg border p-1">
        {MODE_OPTIONS.map(({ value, icon: Icon, label }) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            onClick={() => setMode(value)}
            aria-label={label}
            className={cn('h-7 px-2.5', mode === value && 'bg-accent')}
          >
            <Icon className="size-4" />
          </Button>
        ))}
      </div>
    </div>
  );
}
