import { ArrowDown, ArrowUp } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';

defineRenderer('stat-value', ({ node }) => {
  return (
    <div className="flex shrink-0 flex-col justify-center rounded-md bg-muted/40 px-2 @xs:px-2.5 py-1.5 @xs:py-2">
      <div className="flex items-center gap-1 @xs:gap-1.5">
        {node.icon && (
          <DynamicIcon
            name={node.icon as IconName}
            className="size-3 @xs:size-3.5 shrink-0"
            style={{ color: resolveColor(node.color) ?? undefined }}
          />
        )}
        <span className="truncate text-[10px] @xs:text-[11px] text-muted-foreground">{node.label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-semibold text-sm @xs:text-base tabular-nums leading-tight">
          {typeof node.value === 'number' ? node.value.toLocaleString() : node.value}
        </span>
        {node.unit && <span className="text-[10px] @xs:text-[11px] text-muted-foreground">{node.unit}</span>}
        {node.trend &&
          node.trend !== 'flat' &&
          (node.trend === 'up' ? (
            <ArrowUp className="size-3 text-emerald-500" />
          ) : (
            <ArrowDown className="size-3 text-red-500" />
          ))}
        {node.trendValue && (
          <span
            className={cn(
              'font-medium text-[10px] @xs:text-[11px]',
              node.trend === 'up' && 'text-emerald-500',
              node.trend === 'down' && 'text-red-500',
              (!node.trend || node.trend === 'flat') && 'text-muted-foreground'
            )}
          >
            {node.trendValue}
          </span>
        )}
      </div>
      {node.description && (
        <span className="mt-0.5 text-[10px] @xs:text-[11px] text-muted-foreground">{node.description}</span>
      )}
    </div>
  );
});
