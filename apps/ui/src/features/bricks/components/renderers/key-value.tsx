import { Copy } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';

defineRenderer('key-value', ({ node }) => {
  const stacked = node.layout === 'stacked';

  return (
    <div className={cn('flex flex-col', node.compact ? 'gap-1' : 'gap-2')}>
      {node.items.map((item, i) => (
        <div key={i}>
          <div
            className={cn(
              'flex items-center',
              stacked ? 'flex-col items-start gap-0.5' : 'justify-between gap-2'
            )}
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {item.icon && (
                <DynamicIcon
                  name={item.icon as IconName}
                  className="size-3 shrink-0"
                  style={item.color ? { color: resolveColor(item.color) } : undefined}
                />
              )}
              <span className="text-xs">{item.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={cn('font-medium text-sm', stacked && 'text-xs')}
                style={item.color ? { color: resolveColor(item.color) } : undefined}
              >
                {item.value}
              </span>
              {item.copyable && (
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => navigator.clipboard.writeText(String(item.value))}
                >
                  <Copy className="size-3" />
                </button>
              )}
            </div>
          </div>
          {node.dividers && i < node.items.length - 1 && (
            <div className="mt-1.5 border-border border-t" />
          )}
        </div>
      ))}
    </div>
  );
});
