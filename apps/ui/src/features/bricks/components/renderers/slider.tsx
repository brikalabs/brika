import type { SliderNode } from '@brika/ui-kit';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo, useEffect, useRef, useState } from 'react';
import type { ActionHandler } from './registry';

export const SliderRenderer = memo(function SliderRenderer({
  node,
  onAction,
}: {
  node: SliderNode;
  onAction?: ActionHandler;
}) {
  const [local, setLocal] = useState(node.value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(node.value);
  }, [node.value]);

  const pct = ((local - node.min) / (node.max - node.min)) * 100;
  const hasLabel = node.label || node.icon;

  return (
    <div className={hasLabel ? 'shrink-0 space-y-1.5 rounded-md bg-muted/40 px-2.5 py-2' : 'shrink-0'}>
      {hasLabel && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {node.icon && (
              <DynamicIcon
                name={node.icon as IconName}
                className="size-3.5 shrink-0"
                style={{ color: node.color ?? undefined }}
              />
            )}
            {node.label && <span className="font-medium text-xs">{node.label}</span>}
          </div>
          <span className="font-medium text-xs tabular-nums">
            {local}
            {node.unit && <span className="text-muted-foreground"> {node.unit}</span>}
          </span>
        </div>
      )}
      <input
        type="range"
        min={node.min}
        max={node.max}
        step={node.step ?? 1}
        value={local}
        onChange={(e) => {
          const value = Number(e.target.value);
          setLocal(value);
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            onAction?.(node.onChange, { value });
          }, 80);
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
        style={{
          background: `linear-gradient(to right, ${node.color ?? 'var(--color-primary)'} ${pct}%, var(--color-muted) ${pct}%)`,
        }}
      />
    </div>
  );
});
