import type { Plugin } from '@brika/shared';
import { Link } from '@tanstack/react-router';
import { Plug } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Avatar, AvatarFallback, AvatarImage, Badge, Card } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { pluginsApi } from '../../plugins/api';
import type { BlockDefinition } from '../../workflows/api';

interface BlockCardProps {
  block: BlockDefinition;
  plugin?: Plugin;
}

export function BlockCard({ block, plugin }: Readonly<BlockCardProps>) {
  const { tp } = useLocale();
  const iconName = (block.icon || 'box') as IconName;
  const color = block.color || 'var(--primary)';
  const blockKey = block.id.split(':').pop() || block.id;
  const blockName = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
  const blockDesc = tp(block.pluginId, `blocks.${blockKey}.description`, block.description);
  const pluginName = tp(block.pluginId, 'name', plugin?.name ?? block.pluginId);

  return (
    <Card className="h-full p-5">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <Avatar className="size-10" style={{ backgroundColor: `${color}20`, color }}>
            <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
              <DynamicIcon name={iconName} className="size-5" />
            </AvatarFallback>
          </Avatar>
          {block.category && (
            <Badge variant="secondary" className="text-[10px] uppercase">
              {block.category}
            </Badge>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <h3 className="font-semibold text-sm leading-tight">{blockName}</h3>
          {blockDesc && (
            <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
              {blockDesc}
            </p>
          )}
        </div>

        {plugin ? (
          <Link
            to="/plugins/$uid"
            params={{ uid: plugin.uid }}
            className="group/plugin -mx-2 -mb-2 flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-muted/50"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar className="size-6">
              <AvatarImage src={pluginsApi.getIconUrl(plugin.uid)} />
              <AvatarFallback className="bg-primary/10 text-[8px]">
                <Plug className="size-3" />
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-muted-foreground text-xs group-hover/plugin:text-foreground">
              {pluginName}
            </span>
            <Badge variant="outline" className="text-[10px]">
              v{plugin.version}
            </Badge>
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Plug className="size-3" />
            <span className="truncate">{pluginName}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
