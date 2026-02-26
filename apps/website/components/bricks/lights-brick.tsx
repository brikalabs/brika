'use client';

import { useState } from 'react';

export default function LightsBrick() {
  const [on, setOn] = useState(true);

  return (
    <div className="relative flex h-full flex-col justify-end overflow-hidden px-[10%] pb-[10%]">
      {on && (
        <div
          className="pointer-events-none absolute -top-[10%] -right-[10%] h-[55%] aspect-square rounded-full animate-pulse"
          style={{ background: 'oklch(0.85 0.16 90)', filter: 'blur(20px)', opacity: 0.3 }}
        />
      )}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[clamp(0.875rem,15%,1.125rem)] font-bold leading-tight tracking-tight">{on ? 'On' : 'Off'}</div>
          <div className="mt-[3%] text-[clamp(8px,9%,11px)] text-muted-foreground">Living room</div>
        </div>
        <button
          type="button"
          onClick={() => setOn((v) => !v)}
          className="no-drag relative h-[22%] aspect-[1.8/1] min-h-4 cursor-pointer rounded-full transition-colors duration-300"
          style={{ background: on ? 'var(--primary)' : 'var(--muted)' }}
          aria-label="Toggle lights"
        >
          <div
            className="absolute top-[10%] h-[80%] aspect-square rounded-full bg-white shadow-sm transition-transform duration-300"
            style={{ transform: on ? 'translateX(calc(100% - 2px))' : 'translateX(2px)' }}
          />
        </button>
      </div>
    </div>
  );
}
