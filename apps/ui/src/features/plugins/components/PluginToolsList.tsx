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
import { Wrench } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { splitToolId, useTools } from '@/features/tools/api';
import { toIconName } from '@/features/workflows/editor/icon-name';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';

interface PluginToolsListProps {
  plugin: Plugin;
}

/**
 * The plugin's hub-registered tools (its AI-callable surface). Tools register
 * at runtime, not in the manifest, so this reads the live registry and keeps
 * the qualified-id prefix (`pluginName:tool`) as the ownership link.
 */
export function PluginToolsList({ plugin }: Readonly<PluginToolsListProps>) {
  const { t, tp } = useLocale();
  const { data: allTools = [] } = useTools();
  const tools = allTools.filter((tool) => splitToolId(tool.id).plugin === plugin.name);

  if (tools.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5 text-primary" />
              {t('plugins:details.availableTools')}
            </CardTitle>
            <CardDescription>{t('plugins:details.availableToolsDesc')}</CardDescription>
          </div>
          <Badge variant="secondary">{tools.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const { name } = splitToolId(tool.id);
            const color = tool.color || '#6b7280';
            const displayName = tp(plugin.name, `tools.${name}.name`, name);
            const description = tp(
              plugin.name,
              `tools.${name}.description`,
              tool.description ?? ''
            );
            return (
              <div
                key={tool.id}
                className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <Avatar className="size-10 shrink-0" style={{ backgroundColor: `${color}20` }}>
                  <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
                    <DynamicIcon name={toIconName(tool.icon, 'wrench')} className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{displayName}</div>
                  {description && (
                    <div className="truncate text-muted-foreground text-xs">{description}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
