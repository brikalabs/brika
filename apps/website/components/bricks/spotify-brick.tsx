'use client';

import Image from 'next/image';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const TRACKS = [
  {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    duration: 200,
    cover: '/assets/covers/blinding-lights.jpg',
  },
  {
    title: 'Billie Jean',
    artist: 'Michael Jackson',
    duration: 294,
    cover: '/assets/covers/billie-jean.jpg',
  },
  {
    title: 'Smells Like Teen Spirit',
    artist: 'Nirvana',
    duration: 301,
    cover: '/assets/covers/smells-like-teen-spirit.jpg',
  },
  {
    title: 'Africa',
    artist: 'TOTO',
    duration: 295,
    cover: '/assets/covers/africa.jpg',
  },
  {
    title: 'Fortnight',
    artist: 'Taylor Swift',
    duration: 228,
    cover: '/assets/covers/fortnight.jpg',
  },
  {
    title: 'Coder à Lausanne',
    artist: 'Cowboy du Clavier',
    duration: 151,
    cover: '/assets/covers/coder-a-lausanne.jpg',
  },
];

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function SpotifyBrick() {
  const [trackIdx, setTrackIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(74);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const track = TRACKS[trackIdx];
  const pct = (progress / track.duration) * 100;

  useEffect(() => {
    if (!playing || dragging) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= track.duration) {
          setTrackIdx((i) => (i + 1) % TRACKS.length);
          return 0;
        }
        return p + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, dragging, track.duration]);

  const updateProgress = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setProgress(Math.floor(ratio * track.duration));
    },
    [track.duration]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateProgress(e.clientX);
    },
    [updateProgress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      updateProgress(e.clientX);
    },
    [dragging, updateProgress]
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  const skip = (dir: 1 | -1) => {
    setTrackIdx((i) => (i + dir + TRACKS.length) % TRACKS.length);
    setProgress(0);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Album cover */}
      <div className="relative flex-1 overflow-hidden">
        {TRACKS.map((t, i) => (
          <Image
            key={t.title}
            src={t.cover}
            alt={`${t.title} by ${t.artist}`}
            fill
            sizes="280px"
            className="object-cover transition-opacity duration-500"
            style={{ opacity: i === trackIdx ? 1 : 0 }}
            priority={i === 0}
          />
        ))}
        {/* Bottom fade for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/70 to-transparent" />
        {/* Track info */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
          <div className="truncate text-sm font-bold text-white drop-shadow-sm">
            {track.title}
          </div>
          <div className="truncate text-[11px] text-white/70 drop-shadow-sm">
            {track.artist}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-1.5 px-3 pb-3 pt-2">
        {/* Progress bar */}
        <div>
          <div
            ref={barRef}
            className="group/bar relative h-1 cursor-pointer rounded-full bg-muted touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="slider"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={track.duration}
            tabIndex={0}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%`, transition: dragging ? 'none' : 'width 0.3s ease' }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-primary shadow-sm opacity-0 transition-opacity group-hover/bar:opacity-100"
              style={{ left: `calc(${pct}% - 5px)` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground tabular-nums">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(track.duration)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => skip(-1)}
            className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipBack className="size-3.5" fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95"
          >
            {playing ? (
              <Pause className="size-3.5" fill="currentColor" />
            ) : (
              <Play className="size-3.5 translate-x-px" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={() => skip(1)}
            className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipForward className="size-3.5" fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}
