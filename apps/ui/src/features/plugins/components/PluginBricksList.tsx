import { LayoutDashboard } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';

interface PluginBricksListProps {
  plugin: Plugin;
}

export function PluginBricksList({ plugin }: PluginBricksListProps) {
  const { t, tp } = useLocale();
  const bricks = plugin.bricks ?? [];

  if (bricks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="size-5 text-primary" />
              {t('plugins:details.availableCards')}
            </CardTitle>
            <CardDescription>{t('plugins:details.availableCardsDesc')}</CardDescription>
          </div>
          <Badge variant="secondary">{bricks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bricks.map((brick) => {
            const iconName = (brick.icon || 'layout-dashboard') as IconName;
            const color = brick.color || '#3b82f6';
            const brickKey = brick.id.split(':').pop() || brick.id;
            const brickName = tp(plugin.name, `bricks.${brickKey}.name`, brick.name || brickKey);
            const brickDesc = tp(plugin.name, `bricks.${brickKey}.description`, brick.description);

            return (
              <div
                key={brick.id}
                className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <Avatar
                  className="size-10 shrink-0"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
                    <DynamicIcon name={iconName} className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{brickName}</div>
                  {brickDesc && (
                    <div className="truncate text-muted-foreground text-xs">{brickDesc}</div>
                  )}
                </div>
                {brick.category && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {brick.category}
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
