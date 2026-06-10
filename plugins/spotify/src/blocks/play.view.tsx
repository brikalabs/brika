/**
 * Play block config-panel view.
 *
 * Owns the editor config UI for the Spotify Play block: search the catalog and
 * pick a song (sets the track URI), an optional advanced URI field for
 * playlists/albums, and a dynamic device picker backed by `listDevices`.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@brika/sdk/ui-kit';
import { useAction, useCallAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import { Link2, Music, RefreshCw, Search, Speaker, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listDevices, searchTracks } from '../actions';
import type { TrackResult } from '../spotify-api';

interface PlayConfig {
  contextUri?: string;
  contextLabel?: string;
  deviceId?: string;
}

export default function PlayView() {
  const { t } = useLocale();
  const config = useBlockConfig<PlayConfig>();
  const update = useUpdateBlockConfig();
  const callAction = useCallAction();
  const { data: devices, loading: devicesLoading, refetch } = useAction(listDevices);

  const deviceId = config.deviceId ?? '';
  const selectedUri = config.contextUri ?? '';
  const selectedLabel = config.contextLabel ?? '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackResult[]>([]);
  const [searching, setSearching] = useState(false);
  const runRef = useRef(0);

  // Debounced catalog search, latest query wins.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const run = ++runRef.current;
    const timer = setTimeout(() => {
      callAction(searchTracks, { query: q })
        .then((tracks) => {
          if (run === runRef.current) {
            setResults(tracks);
          }
        })
        .finally(() => {
          if (run === runRef.current) {
            setSearching(false);
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, callAction]);

  const selectTrack = useCallback(
    (track: TrackResult) => {
      update({ contextUri: track.uri, contextLabel: `${track.name} — ${track.artistName}` });
      setQuery('');
      setResults([]);
    },
    [update]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[#1DB954]">
        <Music className="size-4" />
        <span className="font-medium text-foreground text-sm">Play on Spotify</span>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Search className="size-3.5" />
          Song
        </Label>

        {selectedUri && selectedLabel && (
          <div className="flex items-center gap-2 rounded-md border bg-[#1DB954]/10 px-2.5 py-1.5">
            <Music className="size-4 shrink-0 text-[#1DB954]" />
            <span className="min-w-0 flex-1 truncate text-sm">{selectedLabel}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground"
              onClick={() => update({ contextUri: '', contextLabel: '' })}
              aria-label="Clear song"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('player.searchPlaceholder')}
            className="bg-background pl-9"
          />
        </div>

        {query.trim() && (
          <div className="max-h-56 overflow-y-auto rounded-md border bg-background">
            {searching && results.length === 0 && (
              <p className="px-3 py-3 text-center text-muted-foreground text-xs">Searching...</p>
            )}
            {!searching && results.length === 0 && (
              <p className="px-3 py-3 text-center text-muted-foreground text-xs">
                {t('player.noResults')}
              </p>
            )}
            {results.map((track) => (
              <button
                type="button"
                key={track.id}
                onClick={() => selectTrack(track)}
                className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left hover:bg-accent"
              >
                <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                  {track.albumArt ? (
                    <img src={track.albumArt} alt="" className="size-full object-cover" />
                  ) : (
                    <Music className="m-auto size-4 translate-y-2.5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{track.name}</p>
                  <p className="truncate text-muted-foreground text-xs">{track.artistName}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Link2 className="size-3.5" />
          Or a playlist / album URI (optional)
        </Label>
        <Input
          value={selectedUri}
          onChange={(e) => update({ contextUri: e.target.value, contextLabel: '' })}
          placeholder="spotify:playlist:... or https://open.spotify.com/..."
          className="bg-background font-mono text-xs"
        />
        <p className="text-muted-foreground text-xs">
          Leave everything empty to resume the last track.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-xs">
            <Speaker className="size-3.5" />
            Device
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-muted-foreground text-xs"
            onClick={() => refetch()}
            disabled={devicesLoading}
          >
            <RefreshCw className={`size-3 ${devicesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Select value={deviceId} onValueChange={(v) => update({ deviceId: v })}>
            <SelectTrigger className="bg-background">
              <SelectValue
                placeholder={
                  devicesLoading ? t('player.loadingDevices') : t('player.defaultDevice')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(devices ?? []).map((device) => (
                <SelectItem key={device.value} value={device.value}>
                  <span className="flex items-center gap-2">
                    <Speaker className="size-3.5 text-[#1DB954]" />
                    {device.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {deviceId && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground"
              onClick={() => update({ deviceId: '' })}
              aria-label="Use default device"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        {!devicesLoading && (devices ?? []).length === 0 && (
          <p className="text-muted-foreground text-xs">{t('player.noDevices')}</p>
        )}
      </div>
    </div>
  );
}
