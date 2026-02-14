import type { ProgressNode } from '@brika/ui-kit';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';

const trackHeightMap = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2.5',
} as const;

const RING_SIZE = 48;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingProgress({
  pct,
  color,
  label,
  showValue,
}: {
  pct: number;
  color: string;
  label?: string;
  showValue?: boolean;
}) {
  const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <svg width={RING_SIZE} height={RING_SIZE} className="shrink-0 -rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--color-primary)"
          strokeOpacity={0.2}
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-all"
        />
      </svg>
      {(label || showValue) && (
        <div className="flex flex-col">
          {showValue && (
            <span className="font-semibold text-sm tabular-nums">{Math.round(pct)}%</span>
          )}
          {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
        </div>
      )}
    </div>
  );
}

defineRenderer('progress', ({ node }: { node: ProgressNode }) => {
  const pct = Math.max(0, Math.min(100, node.value));
  const color = resolveColor(node.color) ?? 'var(--color-primary)';

  if (node.variant === 'ring') {
    return <RingProgress pct={pct} color={color} label={node.label} showValue={node.showValue} />;
  }

  const trackHeight = trackHeightMap[node.size ?? 'md'];

  return (
    <div className="shrink-0 space-y-1">
      {(node.label || node.showValue) && (
        <div className="flex items-center justify-between gap-2">
          {node.label && (
            <span className="truncate text-[11px] text-muted-foreground">{node.label}</span>
          )}
          {node.showValue && (
            <span className="font-medium text-[11px] tabular-nums">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div
        className={cn('relative w-full overflow-hidden rounded-full bg-primary/20', trackHeight)}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
});
