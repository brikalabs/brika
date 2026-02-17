/**
 * LocationSettings Component
 *
 * Hub location configuration with address search and browser detection.
 * Features: address autocomplete, browser geolocation detect, map preview,
 * collapsible detail fields, and save with visual feedback.
 */

import { Check, ChevronDown, MapPin, Navigation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { type HubLocation, useHubLocation, useUpdateHubLocation } from '../hooks';
import { reverseGeocode } from '../photon';
import { AddressSearch } from './AddressSearch';

export function LocationSettings() {
  const { t } = useLocale();
  const { data } = useHubLocation();
  const mutation = useUpdateHubLocation();
  const [detecting, setDetecting] = useState(false);
  const [draft, setDraft] = useState<HubLocation | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Sync from server when data loads
  useEffect(() => {
    if (data?.location && !isDirty) {
      setDraft(data.location);
    }
  }, [data, isDirty]);

  function handleAddressSelect(location: HubLocation) {
    setDraft(location);
    setIsDirty(true);
  }

  function handleFieldChange(field: keyof HubLocation, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const numFields = new Set<keyof HubLocation>(['latitude', 'longitude']);
      return {
        ...prev,
        [field]: numFields.has(field) ? Number(value) || 0 : value,
      };
    });
    setIsDirty(true);
  }

  function handleDetect() {
    if (!navigator.geolocation) return;
    setDetecting(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const location = await reverseGeocode(latitude, longitude);
        setDraft(
          location ?? {
            latitude,
            longitude,
            street: '',
            city: '',
            state: '',
            postalCode: '',
            country: '',
            countryCode: '',
            formattedAddress: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        );
        setIsDirty(true);
        setDetecting(false);
      },
      () => setDetecting(false),
      { timeout: 10_000 }
    );
  }

  function handleSave() {
    if (!draft) return;
    mutation.mutate(draft, {
      onSuccess: () => {
        setIsDirty(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      },
    });
  }

  const hasLocation = draft && (draft.formattedAddress || draft.latitude !== 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base">{t('settings:location.title')}</h3>
          <p className="text-muted-foreground text-sm">{t('settings:location.description')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDetect} disabled={detecting}>
          <Navigation className="mr-2 size-4" />
          {detecting ? t('settings:location.detecting') : t('settings:location.detect')}
        </Button>
      </div>

      {/* Address Search */}
      <AddressSearch onSelect={handleAddressSelect} />

      {/* Empty state */}
      {!hasLocation && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <MapPin className="size-8 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">{t('settings:location.emptyHint')}</p>
        </div>
      )}

      {/* Current location details */}
      {hasLocation && draft && (
        <div className="space-y-3 rounded-lg border p-4">
          {/* Formatted address — prominent display */}
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <MapPin className="size-4 text-primary" />
            </div>
            <p className="font-medium text-sm">
              {draft.formattedAddress || t('settings:location.notConfigured')}
            </p>
          </div>

          {/* Map preview (static image — crisp on Retina) */}
          {draft.latitude !== 0 && draft.longitude !== 0 && (
            <StaticMap latitude={draft.latitude} longitude={draft.longitude} />
          )}

          {/* Collapsible detail fields */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                {t('settings:location.editDetails')}
                <ChevronDown
                  className={`size-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div>
                  <Label className="text-xs">{t('settings:location.street')}</Label>
                  <Input
                    value={draft.street}
                    onChange={(e) => handleFieldChange('street', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.city')}</Label>
                  <Input
                    value={draft.city}
                    onChange={(e) => handleFieldChange('city', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.postalCode')}</Label>
                  <Input
                    value={draft.postalCode}
                    onChange={(e) => handleFieldChange('postalCode', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.state')}</Label>
                  <Input
                    value={draft.state}
                    onChange={(e) => handleFieldChange('state', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.country')}</Label>
                  <Input
                    value={draft.country}
                    onChange={(e) => handleFieldChange('country', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.timezone')}</Label>
                  <Input
                    value={draft.timezone}
                    onChange={(e) => handleFieldChange('timezone', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.latitude')}</Label>
                  <Input
                    value={draft.latitude}
                    onChange={(e) => handleFieldChange('latitude', e.target.value)}
                    type="number"
                    step="any"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('settings:location.longitude')}</Label>
                  <Input
                    value={draft.longitude}
                    onChange={(e) => handleFieldChange('longitude', e.target.value)}
                    type="number"
                    step="any"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Save */}
      {isDirty && draft && (
        <Button onClick={handleSave} disabled={mutation.isPending} size="sm">
          {showSaved && (
            <>
              <Check className="mr-2 size-4" />
              {t('settings:location.saved')}
            </>
          )}
          {!showSaved &&
            (mutation.isPending ? t('common:actions.saving') : t('common:actions.save'))}
        </Button>
      )}
    </div>
  );
}

// ── Static map preview (tile grid — Retina-ready) ───────────────────────────

const MAP_ZOOM = 15;
const MAP_HEIGHT = 200;
const TILE_SIZE = 256;

/** Convert lat/lng to fractional OSM tile coordinates at a given zoom. */
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function StaticMap({ latitude, longitude }: Readonly<{ latitude: number; longitude: number }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fractional tile position of the center point
  const { x: tileX, y: tileY } = latLngToTile(latitude, longitude, MAP_ZOOM);
  const centerTileX = Math.floor(tileX);
  const centerTileY = Math.floor(tileY);
  const fracX = tileX - centerTileX;
  const fracY = tileY - centerTileY;

  // How many tiles needed to cover the viewport + 1 tile of padding
  const cols = width > 0 ? Math.ceil(width / TILE_SIZE) + 2 : 0;
  const rows = Math.ceil(MAP_HEIGHT / TILE_SIZE) + 2;
  const halfCol = Math.floor(cols / 2);
  const halfRow = Math.floor(rows / 2);

  // Pixel offset so the exact lat/lng sits at viewport center
  const offsetX = width / 2 - (fracX + halfCol) * TILE_SIZE;
  const offsetY = MAP_HEIGHT / 2 - (fracY + halfRow) * TILE_SIZE;

  // Build tile grid
  const tiles: Array<{ key: string; tx: number; ty: number; left: number; top: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = centerTileX - halfCol + col;
      const ty = centerTileY - halfRow + row;
      tiles.push({
        key: `${tx}-${ty}`,
        tx,
        ty,
        left: offsetX + col * TILE_SIZE,
        top: offsetY + row * TILE_SIZE,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-md"
      style={{ height: MAP_HEIGHT }}
    >
      {tiles.map((t) => {
        const src = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${MAP_ZOOM}/${t.tx}/${t.ty}.png`;
        const src2x = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${MAP_ZOOM}/${t.tx}/${t.ty}@2x.png`;
        return (
          <img
            key={t.key}
            src={src}
            srcSet={`${src} 1x, ${src2x} 2x`}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            className="absolute"
            style={{ left: t.left, top: t.top }}
            loading="lazy"
            draggable={false}
          />
        );
      })}
      {/* Center marker */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <MapPin className="size-8 text-primary drop-shadow-md" style={{ marginTop: -16 }} />
      </div>
      {/* Attribution */}
      <span className="absolute right-1 bottom-1 rounded bg-white/70 px-1 text-[10px] text-gray-600 dark:bg-black/50 dark:text-gray-300">
        {'© '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          OSM
        </a>
        {' © '}
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          CARTO
        </a>
      </span>
    </div>
  );
}
