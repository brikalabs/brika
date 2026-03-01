import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ComponentNodeRenderer, defineRenderer } from './registry';

defineRenderer('tabs', ({ node, onAction }) => (
  <Tabs
    value={node.value}
    onValueChange={(value) =>
      onAction?.(node.onChange, {
        value,
      })
    }
    className="flex min-h-0 flex-col"
  >
    <TabsList className={cn(node.variant === 'pills' && 'gap-1 bg-transparent p-0')}>
      {node.tabs.map((tab) => (
        <TabsTrigger
          key={tab.key}
          value={tab.key}
          className={cn(
            'gap-1.5 text-xs',
            node.variant === 'pills' &&
              'rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
          )}
        >
          {tab.icon && <DynamicIcon name={tab.icon as IconName} className="size-3 shrink-0" />}
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
    {node.tabs.map((tab) => (
      <TabsContent key={tab.key} value={tab.key} className="flex min-h-0 flex-1 flex-col">
        {tab.children.map((child, i) => (
          <ComponentNodeRenderer key={`${child.type}-${i}`} node={child} onAction={onAction} />
        ))}
      </TabsContent>
    ))}
  </Tabs>
));
