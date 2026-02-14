import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { ComponentNodeRenderer, defineRenderer } from './registry';
import { gapVariant } from './shared';

defineRenderer('section', ({ node, onAction }) => {
  const clickable = !!node.onPress;
  const gap = node.gap ? gapVariant[node.gap] : 'gap-1.5';

  return (
    <div
      className={cn('flex min-h-0 flex-col', gap, clickable && 'cursor-pointer')}
      onClick={clickable ? () => onAction?.(String(node.onPress)) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAction?.(String(node.onPress)); } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="flex shrink-0 items-center gap-2">
        {node.icon && (
          <DynamicIcon
            name={node.icon as IconName}
            className="size-3 shrink-0 text-muted-foreground"
          />
        )}
        <h4 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          {node.title}
        </h4>
        <div className="h-px flex-1 bg-border/50" />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col', gap)}>
        {node.children.map((child, i) => (
          <ComponentNodeRenderer key={`${child.type}-${i}`} node={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
});
