import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';

defineRenderer('toggle', ({ node, onAction }) => {
  const [local, setLocal] = useState(node.checked);

  useEffect(() => {
    setLocal(node.checked);
  }, [node.checked]);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between @md:gap-3 gap-2 rounded-md @md:px-3 px-2.5 @md:py-2.5 py-2 transition-colors',
        local ? 'bg-primary/10' : 'bg-muted/40',
        node.disabled && 'pointer-events-none opacity-50'
      )}
    >
      <div className="flex items-center @md:gap-2 gap-1.5">
        {node.icon && (
          <DynamicIcon
            name={node.icon as IconName}
            className="@md:size-4 size-3.5 shrink-0"
            style={{ color: resolveColor(node.color) ?? undefined }}
          />
        )}
        <span className="font-medium @md:text-sm text-xs">{node.label}</span>
      </div>
      <Switch
        checked={local}
        disabled={node.disabled}
        onCheckedChange={(checked) => {
          setLocal(checked);
          onAction?.(node.onToggle, { checked });
        }}
      />
    </div>
  );
});
