'use client';

import { useEffect, useState } from 'react';

export default function CpuBrick() {
  const [load, setLoad] = useState(47);

  useEffect(() => {
    const id = setInterval(() => {
      setLoad((l) => Math.max(10, Math.min(95, l + (Math.random() - 0.48) * 12)));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const rounded = Math.round(load);
  let hue = 30;
  if (load < 60) hue = 145;
  else if (load < 80) hue = 90;
  const color = `oklch(0.7 0.16 ${hue})`;

  return (
    <div className="relative flex h-full flex-col justify-end overflow-hidden px-[10%] pb-[10%]">
      <div>
        <div className="mb-[8%] h-[6%] min-h-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${rounded}%`,
              background: color,
            }}
          />
        </div>
        <div className="text-[clamp(1.25rem,22%,1.5rem)] font-bold leading-tight tracking-tight tabular-nums">
          {rounded}%
        </div>
        <div className="mt-[3%] text-[clamp(8px,9%,11px)] text-muted-foreground">Load average</div>
      </div>
    </div>
  );
}
