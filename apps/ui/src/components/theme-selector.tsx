import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/lib/theme-context';

const THEME_LABELS: Record<string, string> = {
  default: 'Default',
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
  lavender: 'Lavender',
  ruby: 'Ruby',
};

export function ThemeSelector() {
  const { theme, mode, setTheme, toggleMode } = useTheme();

  return (
    <div className="flex items-center gap-2">
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

      <Button variant="outline" size="icon" onClick={toggleMode}>
        {mode === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </Button>
    </div>
  );
}
