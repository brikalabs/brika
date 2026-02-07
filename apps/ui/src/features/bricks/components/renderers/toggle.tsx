import type { ToggleNode } from '@brika/ui-kit';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo, useEffect, useState } from 'react';
import { Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ActionHandler } from './registry';

export const ToggleRenderer = memo(function ToggleRenderer({
  node,
  onAction,
}: {
  node: ToggleNode;
  onAction?: ActionHandler;
}) {
  const [local, setLocal] = useState(node.checked);

  useEffect(() => {
    setLocal(node.checked);
  }, [node.checked]);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-2 transition-colors',
        local ? 'bg-primary/10' : 'bg-muted/40'
      )}
    >
      <div className="flex items-center gap-1.5">
        {node.icon && (
          <DynamicIcon
            name={node.icon as IconName}
            className="size-3.5 shrink-0"
            style={{ color: node.color ?? undefined }}
          />
        )}
        <span className="font-medium text-xs">{node.label}</span>
      </div>
      <Switch
        checked={local}
        onCheckedChange={(checked) => {
          setLocal(checked);
          onAction?.(node.onToggle, { checked });
        }}
      />
    </div>
  );
});
