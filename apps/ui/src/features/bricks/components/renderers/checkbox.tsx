import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

defineRenderer('checkbox', ({ node, onAction }) => {
  const [local, setLocal] = useState(node.checked);

  useEffect(() => {
    setLocal(node.checked);
  }, [node.checked]);

  return (
    <label
      className={cn(
        'flex shrink-0 cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 transition-colors',
        local ? 'bg-primary/10' : 'bg-muted/40',
        node.disabled && 'pointer-events-none opacity-50'
      )}
    >
      <input
        type="checkbox"
        checked={local}
        disabled={node.disabled}
        className="mt-0.5 size-3.5 shrink-0 accent-primary"
        onChange={(e) => {
          setLocal(e.target.checked);
          onAction?.(node.onToggle, { checked: e.target.checked });
        }}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {node.icon && (
            <DynamicIcon
              name={node.icon as IconName}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          <span className="font-medium text-xs">{node.label}</span>
        </div>
        {node.description && (
          <span className="text-[11px] text-muted-foreground">{node.description}</span>
        )}
      </div>
    </label>
  );
});
