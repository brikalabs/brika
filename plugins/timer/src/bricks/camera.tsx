/**
 * Camera brick — client-side rendered.
 *
 * HLS video player with stream switching. All state is local —
 * no server data push needed. Uses a native <video> element.
 * Safari supports HLS natively; other browsers may need an HLS library
 * for .m3u8 — for this demo we use MP4 fallback URLs.
 */

import { useBrickConfig, useBrickSize } from '@brika/sdk/brick-views';
import { cva } from 'class-variance-authority';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Circle, Radio, Square, Video } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

const recordButtonVariants = cva(
  'flex h-7 cursor-pointer items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
  {
    variants: {
      recording: {
        true: 'bg-red-600 text-white hover:bg-red-700',
        false: 'bg-foreground text-background hover:opacity-90',
      },
    },
  },
);

const STREAMS = [
  { name: 'Sintel', src: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
  { name: 'Big Buck Bunny', src: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { name: 'Elephants Dream', src: 'https://playertest.longtailvideo.com/adaptive/elephants_dream_v4/index.m3u8' },
  { name: 'Oceans', src: 'https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8' },
  { name: 'Angel One', src: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8' },
];

export default function CameraBrick() {
  const { width, height } = useBrickSize();
  const config = useBrickConfig();

  const defaultStreamName = typeof config.defaultStream === 'string' ? config.defaultStream : STREAMS[0].name;
  const muted = typeof config.muted === 'boolean' ? config.muted : true;

  const defaultIndex = Math.max(0, STREAMS.findIndex((s) => s.name === defaultStreamName));
  const [streamIndex, setStreamIndex] = useState(defaultIndex);
  const [recording, setRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stream = STREAMS[streamIndex % STREAMS.length];

  const handleNext = useCallback(() => {
    setStreamIndex((i) => (i + 1) % STREAMS.length);
  }, []);

  const handlePrev = useCallback(() => {
    setStreamIndex((i) => (i - 1 + STREAMS.length) % STREAMS.length);
  }, []);

  const handleToggleRec = useCallback(() => {
    setRecording((r) => !r);
  }, []);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden rounded-lg">
      {/* Video player */}
      <div className="relative flex-1 overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          src={stream.src}
          muted={muted}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        >
          <track kind="captions" />
        </video>
        {/* Recording indicator */}
        {recording && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-red-600/80 px-2 py-0.5 backdrop-blur-sm">
            <Circle className="size-2 animate-pulse fill-white text-white" />
            <span className="text-[10px] font-bold text-white">REC</span>
          </div>
        )}
      </div>

      {/* Info bar */}
      {height >= 3 && (
        <div className="flex items-center gap-2 px-2">
          <div className="flex items-center gap-1.5">
            <Video className="size-3.5 text-red-400" />
            <span className="truncate text-xs font-medium text-foreground">{stream.name}</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span
              className={clsx('size-2 rounded-full', recording ? 'animate-pulse bg-red-500' : 'bg-emerald-500')}
            />
            <span className="text-[10px] text-muted-foreground">
              {recording ? 'Recording' : 'Live'}
            </span>
          </div>
          {width >= 4 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Radio className="size-3" />
              <span>HLS</span>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      {height >= 4 && (
        <div className="flex items-center justify-center gap-2 px-2 pb-2">
          <button
            type="button"
            onClick={handlePrev}
            className="flex size-7 cursor-pointer items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleRec}
            className={recordButtonVariants({ recording })}
          >
            {recording ? <Square className="size-3" /> : <Circle className="size-3" />}
            {recording ? 'Stop' : 'Record'}
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="flex size-7 cursor-pointer items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
