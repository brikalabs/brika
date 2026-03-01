'use client';

import { useEffect, useState } from 'react';

const TOTAL = 300;
const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TimerBrick() {
  const [seconds, setSeconds] = useState(272);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : TOTAL));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const offset = CIRCUMFERENCE * (1 - seconds / TOTAL);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <div className="flex h-full flex-col items-center justify-center px-[8%] pb-[5%]">
      <div className="relative aspect-square w-[75%]">
        <svg viewBox="0 0 72 72" className="size-full drop-shadow-sm">
          <defs>
            <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <circle
            cx="36"
            cy="36"
            r={RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="5"
            opacity="0.4"
          />
          <circle
            cx="36"
            cy="36"
            r={RADIUS}
            fill="none"
            stroke="url(#timer-gradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 36 36)"
            style={{
              transition: 'stroke-dashoffset 1s linear',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[clamp(0.75rem,14%,1rem)] font-bold tabular-nums tracking-tight">
            {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
          </span>
        </div>
      </div>
      <span className="text-[clamp(8px,9%,11px)] font-medium text-muted-foreground">Remaining</span>
    </div>
  );
}
