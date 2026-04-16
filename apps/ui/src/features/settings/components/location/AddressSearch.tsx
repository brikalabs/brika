import { MapPin, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { HubLocation } from './hooks';
import { featureToLocation, formatAddress, type PhotonFeature, searchAddress } from './photon';

interface AddressSearchProps {
  onSelect: (location: HubLocation) => void;
}

export function AddressSearch({ onSelect }: Readonly<AddressSearchProps>) {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const features = await searchAddress(q, controller.signal);
      setResults(features);
      setOpen(features.length > 0);
    } catch {
      // Aborted or network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query, search]);

  function handleSelect(feature: PhotonFeature) {
    const location = featureToLocation(feature);
    setQuery(location.formattedAddress);
    setOpen(false);
    onSelect(location);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('settings:location.searchPlaceholder')}
            className="pl-9"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {results.length === 0 && !loading && (
          <p className="px-3 py-2 text-muted-foreground text-sm">
            {t('settings:location.noResults')}
          </p>
        )}
        {results.map((feature, i) => {
          const label = formatAddress(feature.properties);
          return (
            <button
              key={`${label}-${i}`}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              onClick={() => handleSelect(feature)}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
