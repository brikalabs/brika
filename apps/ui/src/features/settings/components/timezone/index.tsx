import {
  Button,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@brika/clay';
import { Check, Clock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone');

// ─── Timezone Picker ──────────────────────────────────────────────────────────

interface TimezonePickerProps {
  value: string | null;
  onChange: (timezone: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimezonePicker({
  value,
  onChange,
  placeholder,
  className,
}: Readonly<TimezonePickerProps>) {
  const { t } = useLocale();
  const capture = useCapture();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) {
      return ALL_TIMEZONES;
    }
    const lower = query.toLowerCase();
    return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(lower));
  }, [query]);

  function handleSelect(tz: string) {
    capture('settings.timezone_selected', { timezone: tz });
    onChange(tz);
    setOpen(false);
    setQuery('');
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      capture('settings.timezone_picker_opened');
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-between font-normal', className)}>
          <span className={value ? '' : 'text-muted-foreground'}>
            {value ? value.replaceAll('_', ' ') : placeholder}
          </span>
          <Clock className="ml-2 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
        <InputGroup className="mb-2 h-8">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="text-sm"
            autoFocus
          />
        </InputGroup>
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-muted-foreground text-sm">
              {t('settings:location.noResults')}
            </p>
          )}
          {filtered.map((tz) => (
            <button
              key={tz}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={() => handleSelect(tz)}
            >
              {tz === value ? (
                <Check className="size-3.5 shrink-0 text-primary" />
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{tz.replaceAll('_', ' ')}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
