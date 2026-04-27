import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@brika/clay';
import { Boxes } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';

interface PluginBlocksListProps {
  plugin: Plugin;
}

export function PluginBlocksList({ plugin }: Readonly<PluginBlocksListProps>) {
  const { t, tp } = useLocale();
  const blocks = plugin.blocks ?? [];

  if (blocks.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="size-5 text-primary" />
              {t('plugins:details.availableBlocks')}
            </CardTitle>
            <CardDescription>{t('plugins:details.availableBlocksDesc')}</CardDescription>
          </div>
          <Badge variant="secondary">{blocks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((block) => {
            const iconName = (block.icon || 'box') as IconName;
            const color = block.color || '#6366f1';
            const blockKey = block.id.split(':').pop() || block.id;
            const blockName = tp(plugin.name, `blocks.${blockKey}.name`, block.name || blockKey);
            const blockDesc = tp(plugin.name, `blocks.${blockKey}.description`, block.description);

            return (
              <div
                key={block.id}
                className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <Avatar
                  className="size-10 shrink-0"
                  style={{
                    backgroundColor: `${color}20`,
                    color,
                  }}
                >
                  <AvatarFallback
                    style={{
                      backgroundColor: `${color}20`,
                      color,
                    }}
                  >
                    <DynamicIcon name={iconName} className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{blockName}</div>
                  {blockDesc && (
                    <div className="truncate text-muted-foreground text-xs">{blockDesc}</div>
                  )}
                </div>
                {block.category && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {block.category}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
