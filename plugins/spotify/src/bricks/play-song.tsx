/**
 * Play a Song — client-rendered brick.
 *
 * A search box over Spotify's catalog with a results list; clicking a result
 * starts playback on the resolved device. Search and playback both run through
 * plugin actions (useCallAction), so no API keys live in the browser.
 */

import { useBrickConfig, useBrickData } from '@brika/sdk/brick-views';
import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { LogIn, Music, Play, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { playTrack, searchTracks } from '../actions';
import type { TrackResult } from '../spotify-api';

interface PlaySongData {
  isAuthed: boolean;
  authUrl: string;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(totalSec % 60).padStart(2, '0')}`;
}

export default function PlaySong() {
  const config = useBrickConfig();
  const data = useBrickData<PlaySongData>();
  const callAction = useCallAction();

  const deviceId = typeof config.device === 'string' && config.device ? config.device : undefined;
  const isAuthed = data?.isAuthed ?? false;
  const authUrl = data?.authUrl ?? '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const runRef = useRef(0);

  // Debounced search: each keystroke schedules a query, superseding the last.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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
            setLoading(false);
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, callAction]);

  const onPlay = useCallback(
    (track: TrackResult) => {
      setPlayingUri(track.uri);
      callAction(playTrack, { uri: track.uri, deviceId });
    },
    [callAction, deviceId]
  );

  if (!isAuthed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <Music className="size-10 text-[#1DB954]" />
        <p className="text-muted-foreground text-sm">Connect Spotify to search and play songs.</p>
        {authUrl && (
          <a
            href={authUrl}
            className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-2 font-medium text-sm text-white"
          >
            <LogIn className="size-4" />
            Connect to Spotify
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists..."
          className="w-full rounded-md border bg-background py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-[#1DB954]/50"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1 pr-2">
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-2 py-4 text-center text-muted-foreground text-xs">No results</p>
          )}
          {results.map((track) => (
            <button
              type="button"
              key={track.id}
              onClick={() => onPlay(track)}
              className="group flex items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent"
            >
              <div className="relative size-10 shrink-0 overflow-hidden rounded bg-muted">
                {track.albumArt ? (
                  <img src={track.albumArt} alt="" className="size-full object-cover" />
                ) : (
                  <Music className="absolute inset-0 m-auto size-4 text-muted-foreground" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
                  <Play className="size-4 fill-white text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-medium text-sm ${playingUri === track.uri ? 'text-[#1DB954]' : 'text-foreground'}`}
                >
                  {track.name}
                </p>
                <p className="truncate text-muted-foreground text-xs">{track.artistName}</p>
              </div>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatMs(track.durationMs)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
