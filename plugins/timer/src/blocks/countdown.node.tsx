/**
 * Countdown block node-body view.
 *
 * Renders a live progress ring on the canvas node driven by the runtime ticks
 * the countdown emits ({ remaining, total, progress }). When idle (editor, or
 * before the first tick) it falls back to the configured duration.
 */

import { useBlockConfig, useBlockData } from '@brika/sdk/block-views';
import { Clock } from 'lucide-react';

interface CountdownConfig {
  duration?: number;
}

interface CountdownTick {
  remaining: number;
  total: number;
  progress: number;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

const SIZE = 76;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CountdownNode() {
  const config = useBlockConfig<CountdownConfig>();
  const tick = useBlockData<CountdownTick>();

  const total = tick?.total ?? config.duration ?? 60_000;
  const remaining = tick?.remaining ?? total;
  const running = tick !== undefined && tick.remaining > 0;
  const progress = Math.min(1, Math.max(0, tick?.progress ?? 0));
  const offset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label={`${formatClock(remaining)} remaining`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="stroke-blue-500 transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-semibold text-foreground text-sm tabular-nums">
            {formatClock(remaining)}
          </span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
            {running ? 'running' : 'idle'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="size-3" />
        <span>{formatClock(total)} total</span>
      </div>
    </div>
  );
}
