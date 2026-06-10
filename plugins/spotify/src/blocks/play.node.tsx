/**
 * Play block node-body view.
 *
 * The flagship "Spotify block that renders an image": shows the current track's
 * album art with track and artist name, pulled live from the shared player store
 * through the `getNowPlaying` server action. Refreshes on an interval so the
 * canvas node stays in sync with playback. Falls back to a Music icon when
 * nothing is playing.
 */

import { useAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import { Music } from 'lucide-react';
import { useEffect } from 'react';
import { getNowPlaying } from '../actions';

const REFRESH_MS = 4000;

export default function PlayNode() {
  const { t } = useLocale();
  const { data, loading, refetch } = useAction(getNowPlaying);

  // Keep the node in sync with live playback while it is mounted.
  useEffect(() => {
    const id = setInterval(refetch, REFRESH_MS);
    return () => clearInterval(id);
  }, [refetch]);

  if (loading && data === undefined) {
    return (
      <div className="flex h-16 items-center justify-center rounded-md border border-dashed">
        <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-[#1DB954]" />
      </div>
    );
  }

  const track = data ?? null;

  if (!track) {
    return (
      <div className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground">
        <Music className="size-5 text-[#1DB954]" />
        <span className="text-[10px]">{t('player.nothingPlaying')}</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-md border bg-linear-to-r from-[#1DB954]/10 to-transparent p-2">
      <style>{`@keyframes spotify-eq{0%,100%{transform:scaleY(0.35)}50%{transform:scaleY(1)}}`}</style>

      <div className="relative size-12 shrink-0 overflow-hidden rounded">
        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt={`${track.trackName} album cover`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted">
            <Music className="size-5 text-[#1DB954]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground text-sm leading-tight">
          {track.trackName}
        </p>
        <p className="truncate text-muted-foreground text-xs leading-tight">{track.artistName}</p>
      </div>

      {track.isPlaying && (
        <div className="flex h-4 items-end gap-0.5 pr-1">
          {[0, 1, 2].map((bar) => (
            <span
              key={bar}
              className="w-0.5 origin-bottom rounded-full bg-[#1DB954]"
              style={{
                height: '100%',
                animation: `spotify-eq 0.9s ease-in-out ${bar * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
