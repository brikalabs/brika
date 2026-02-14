import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

defineRenderer('text-input', ({ node, onAction }) => {
  const [local, setLocal] = useState(node.value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(node.value);
  }, [node.value]);

  const hasLabel = node.label || node.icon;

  return (
    <div className={cn('shrink-0 space-y-1', node.disabled && 'opacity-50')}>
      {hasLabel && (
        <div className="flex items-center gap-1.5">
          {node.icon && (
            <DynamicIcon
              name={node.icon as IconName}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          {node.label && <span className="font-medium text-xs">{node.label}</span>}
        </div>
      )}
      {node.multiline ? (
        <textarea
          value={local}
          rows={node.rows ?? 3}
          placeholder={node.placeholder}
          disabled={node.disabled}
          onChange={(e) => {
            const value = e.target.value;
            setLocal(value);
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              onAction?.(node.onChange, { value });
            }, 300);
          }}
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed"
        />
      ) : (
        <input
          type={node.inputType ?? 'text'}
          value={local}
          placeholder={node.placeholder}
          disabled={node.disabled}
          onChange={(e) => {
            const value = e.target.value;
            setLocal(value);
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              onAction?.(node.onChange, { value });
            }, 300);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && node.onSubmit) {
              clearTimeout(timerRef.current);
              onAction?.(node.onSubmit, { value: local });
            }
          }}
          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed"
        />
      )}
    </div>
  );
});
