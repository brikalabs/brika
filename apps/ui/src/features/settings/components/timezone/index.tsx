import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
} from '@brika/clay';
import { Check, Clock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { useHubTimezone, useUpdateHubTimezone } from './hooks';

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone');

export function TimezoneSettings() {
  const { t } = useLocale();
  const { data } = useHubTimezone();
  const mutation = useUpdateHubTimezone();
  const current = data?.timezone ?? null;

  return (
    <>
      <SectionHeader>
        <SectionInfo>
          <SectionIcon>
            <Clock className="size-4" />
          </SectionIcon>
          <div>
            <SectionTitle>{t('settings:timezone.title')}</SectionTitle>
            <SectionDescription>{t('settings:timezone.description')}</SectionDescription>
          </div>
        </SectionInfo>
      </SectionHeader>

      <SectionContent>
        <TimezonePicker
          value={current}
          onChange={(tz) => mutation.mutate(tz)}
          placeholder={t('settings:timezone.select')}
        />
      </SectionContent>
    </>
  );
}

// ─── Timezone Picker ──────────────────────────────────────────────────────────

interface TimezonePickerProps {
  value: string | null;
  onChange: (timezone: string) => void;
  placeholder?: string;
}

export function TimezonePicker({ value, onChange, placeholder }: Readonly<TimezonePickerProps>) {
  const { t } = useLocale();
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
    onChange(tz);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-64 justify-between font-normal">
          <span className={value ? '' : 'text-muted-foreground'}>{value ?? placeholder}</span>
          <Clock className="ml-2 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-sm"
            autoFocus
          />
        </div>
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
