/**
 * Now Playing brick view: album art, track title, artist, and a subtle
 * playing indicator. Read-only by design; the full Spotify Player brick
 * carries the controls.
 */

import { Disc3, Music2 } from 'lucide-react';
import { nowPlayingBrick } from './now-playing.brick';

export interface NowPlayingData {
  trackName: string | null;
  artistName: string | null;
  albumArt: string | null;
  isPlaying: boolean;
  isAuthed: boolean;
}

export default function NowPlaying() {
  const data = nowPlayingBrick.data.use();

  if (!data?.isAuthed) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-4 text-muted-foreground text-sm">
        <Music2 className="size-4" />
        Connect Spotify in the player brick
      </div>
    );
  }

  if (!data.trackName) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-4 text-muted-foreground text-sm">
        <Disc3 className="size-4" />
        Nothing played yet
      </div>
    );
  }

  return (
    <div className="flex h-full items-center gap-3 p-3">
      {data.albumArt ? (
        <img
          src={data.albumArt}
          alt={data.trackName}
          className="size-14 shrink-0 rounded-md object-cover shadow"
        />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
          <Music2 className="size-6 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-sm">{data.trackName}</p>
        <p className="truncate text-muted-foreground text-xs">{data.artistName}</p>
      </div>
      {data.isPlaying && (
        <Disc3 className="size-4 shrink-0 animate-spin text-[#1DB954] [animation-duration:3s]" />
      )}
    </div>
  );
}
