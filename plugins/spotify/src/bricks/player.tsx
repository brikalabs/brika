/**
 * Spotify Player — client-rendered brick.
 *
 * Design: full-bleed album art, gradient overlay with scrolling track info,
 * pointer-draggable progress bar, and minimal transport controls.
 * Compact layout (≤2×2) shows cover art with overlay buttons.
 */

import { useBrickConfig, useBrickData, useBrickSize } from '@brika/sdk/brick-views';
import { useCallAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import { LogIn, Music, SkipBack, SkipForward } from 'lucide-react';
import { useCallback } from 'react';
import { doNext, doPause, doPlay, doPrevious } from '../actions';
import type { PlaybackState, RecentTrack } from '../spotify-api';
import { AlbumCover, PlayPauseButton, ScrollText, TransportButton } from './components';
import { useProgress } from './use-progress';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpotifyPlayerData {
  playback: PlaybackState | null;
  recentTrack: RecentTrack | null;
  isAuthed: boolean;
  loaded: boolean;
  anchor: { progressMs: number; timestamp: number };
  authUrl: string;
}

function formatMs(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(totalSec % 60).padStart(2, '0')}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SpotifyPlayer() {
  const { width, height } = useBrickSize();
  const config = useBrickConfig();
  const data = useBrickData<SpotifyPlayerData>();
  const { t } = useLocale();
  const callAction = useCallAction();

  const deviceId = typeof config.device === 'string' && config.device ? config.device : undefined;
  const playback = data?.playback ?? null;
  const recentTrack = data?.recentTrack ?? null;
  const isAuthed = data?.isAuthed ?? false;
  const anchor = data?.anchor ?? { progressMs: 0, timestamp: Date.now() };
  const authUrl = data?.authUrl ?? '';

  const track = playback ?? recentTrack;
  const isPlaying = playback?.isPlaying ?? false;
  const durationMs = playback?.durationMs ?? 0;

  const progress = useProgress(anchor, isPlaying, durationMs, callAction);

  const onToggle = useCallback(() => {
    callAction(isPlaying ? doPause : doPlay, { deviceId });
  }, [callAction, isPlaying, deviceId]);
  const onNext = useCallback(() => { callAction(doNext); }, [callAction]);
  const onPrev = useCallback(() => { callAction(doPrevious); }, [callAction]);

  // ─── Loading ──────────────────────────────────────────────────────

  if (!data?.loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  // ─── Auth required ────────────────────────────────────────────────

  if (!isAuthed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
        <Music className="size-8 text-[#1DB954]" />
        <span className="font-semibold text-foreground">{t('player.title')}</span>
        <a
          href={authUrl}
          className="mt-2 flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-[#1ed760]"
        >
          <LogIn className="size-4" />
          {t('player.login')}
        </a>
      </div>
    );
  }

  // ─── No track — idle play button ──────────────────────────────────

  if (!track) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <PlayPauseButton isPlaying={false} onToggle={onToggle} variant="idle" />
      </div>
    );
  }

  // ─── Compact layout (≤2×2) ────────────────────────────────────────

  if (width <= 2 && height <= 2) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg">
        <AlbumCover trackName={track.trackName} artistName={track.artistName} albumArt={track.albumArt} />
        <div className="absolute inset-0 bg-radial from-black/10 to-black/50" />
        <div className="relative flex items-center gap-2">
          <TransportButton onClick={onPrev} icon={SkipBack} size="md" />
          <PlayPauseButton isPlaying={isPlaying} onToggle={onToggle} variant="compact" />
          <TransportButton onClick={onNext} icon={SkipForward} size="md" />
        </div>
      </div>
    );
  }

  // ─── Default layout ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      <style>{`@keyframes spotify-scroll{0%,15%{transform:translateX(0)}85%,100%{transform:translateX(var(--scroll-dist))}}`}</style>

      {/* Album cover + track info */}
      <div className="relative flex-1 overflow-hidden">
        <AlbumCover trackName={track.trackName} artistName={track.artistName} albumArt={track.albumArt} />
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/15 to-black/25" />
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
          <ScrollText text={track.trackName} className="text-sm font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]" />
          <ScrollText text={track.artistName} className="mt-0.5 text-[11px] text-[rgba(255,255,255,0.8)] [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]" />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-1.5 px-3 pb-3 pt-2">
        {/* Progress bar */}
        <div>
          <div
            ref={progress.barRef}
            className="group/bar relative h-1 cursor-pointer rounded-full bg-muted touch-none"
            onPointerDown={progress.onPointerDown}
            onPointerMove={progress.onPointerMove}
            onPointerUp={progress.onPointerUp}
            role="slider"
            aria-valuenow={progress.localProgressMs}
            aria-valuemin={0}
            aria-valuemax={durationMs}
            tabIndex={0}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${progress.pct}%`,
                transition: progress.dragging ? 'none' : 'width 0.3s ease',
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-primary shadow-sm opacity-0 transition-opacity group-hover/bar:opacity-100"
              style={{ left: `calc(${progress.pct}% - 5px)` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground tabular-nums">
            <span>{formatMs(progress.localProgressMs)}</span>
            <span>{formatMs(durationMs)}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center justify-center gap-4">
          <TransportButton onClick={onPrev} icon={SkipBack} />
          <PlayPauseButton isPlaying={isPlaying} onToggle={onToggle} />
          <TransportButton onClick={onNext} icon={SkipForward} />
        </div>
      </div>
    </div>
  );
}
