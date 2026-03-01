import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

defineRenderer('select', ({ node, onAction }) => {
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
      <Select
        value={node.value}
        disabled={node.disabled}
        onValueChange={(value) =>
          onAction?.(node.onChange, {
            value,
          })
        }
      >
        <SelectTrigger size="sm" className="h-7 w-full text-xs">
          <SelectValue placeholder={node.placeholder ?? 'Select...'} />
        </SelectTrigger>
        <SelectContent>
          {node.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});
