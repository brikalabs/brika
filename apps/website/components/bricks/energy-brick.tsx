'use client';

const bars = [0.4, 0.7, 0.55, 0.85, 0.6, 0.45, 0.75];

export default function EnergyBrick() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden px-3 pb-3">
      <div className="flex min-h-0 flex-1 items-end gap-0.75 pb-[8%]">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 origin-bottom rounded-sm"
            style={{
              height: `${h * 100}%`,
              background:
                i === bars.length - 1
                  ? 'oklch(0.72 0.15 145)'
                  : 'color-mix(in oklch, oklch(0.72 0.15 145) 40%, transparent)',
              animation: `bar-grow 0.6s ease-out ${i * 80}ms backwards`,
            }}
          />
        ))}
      </div>
      <div className="text-[clamp(0.875rem,15%,1.125rem)] font-bold leading-tight tracking-tight">3.2 kWh</div>
      <div className="mt-[3%] text-[clamp(8px,9%,11px)] text-muted-foreground">Today&apos;s usage</div>
    </div>
  );
}
