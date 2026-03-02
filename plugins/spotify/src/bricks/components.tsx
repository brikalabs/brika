import { cva } from 'class-variance-authority';
import clsx from 'clsx';
import { Music, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ScrollText({ text, className }: Readonly<{ text: string; className?: string }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollPx, setScrollPx] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;
    const frame = requestAnimationFrame(() => {
      const diff = textEl.offsetWidth - container.offsetWidth;
      setScrollPx(diff > 2 ? diff : 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  const needsScroll = scrollPx > 0;
  const duration = Math.max(4, scrollPx / 25);

  return (
    <div
      ref={containerRef}
      className={clsx('overflow-hidden', className)}
      style={needsScroll ? {
        maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
      } : undefined}
    >
      <span
        ref={textRef}
        className={needsScroll ? 'inline-block whitespace-nowrap' : 'block truncate'}
        style={needsScroll ? {
          animationName: 'spotify-scroll',
          animationDuration: `${duration}s`,
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          animationDirection: 'alternate',
          '--scroll-dist': `-${scrollPx}px`,
        } as React.CSSProperties : undefined}
      >
        {text}
      </span>
    </div>
  );
}

export function AlbumCover({ trackName, artistName, albumArt }: Readonly<{
  trackName: string;
  artistName: string;
  albumArt?: string;
}>) {
  if (albumArt) {
    return (
      <img
        src={albumArt}
        alt={`${trackName} by ${artistName}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted">
      <Music className="size-8 text-muted-foreground" />
    </div>
  );
}

const transportVariants = cva('cursor-pointer transition-colors', {
  variants: {
    size: {
      sm: 'text-muted-foreground hover:text-foreground',
      md: 'flex size-7 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/30',
    },
  },
  defaultVariants: { size: 'sm' },
});

const transportIconVariants = cva('', {
  variants: {
    size: { sm: 'size-3.5', md: 'size-3' },
  },
  defaultVariants: { size: 'sm' },
});

export function TransportButton({ onClick, icon: Icon, size = 'sm' }: Readonly<{
  onClick: () => void;
  icon: typeof Play;
  size?: 'sm' | 'md';
}>) {
  return (
    <button type="button" onClick={onClick} className={transportVariants({ size })}>
      <Icon className={transportIconVariants({ size })} fill="currentColor" />
    </button>
  );
}

const playPauseVariants = cva(
  'flex cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95',
  {
    variants: {
      variant: {
        idle: 'size-12',
        compact: 'size-10',
        default: 'size-8',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const playPauseIconVariants = cva('', {
  variants: {
    variant: { idle: 'size-5', compact: 'size-4', default: 'size-3.5' },
  },
  defaultVariants: { variant: 'default' },
});

export function PlayPauseButton({ isPlaying, onToggle, variant = 'default' }: Readonly<{
  isPlaying: boolean;
  onToggle: () => void;
  variant?: 'default' | 'compact' | 'idle';
}>) {
  const Icon = isPlaying ? Pause : Play;

  return (
    <button type="button" onClick={onToggle} className={playPauseVariants({ variant })}>
      <Icon className={clsx(playPauseIconVariants({ variant }), !isPlaying && 'translate-x-px')} fill="currentColor" />
    </button>
  );
}
