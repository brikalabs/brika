import type { Plugin } from '@brika/plugin';
import { ArrowRight, Plug } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { pluginsApi } from '../api';
import type { UpdateInfo } from '../registry-api';

interface UpdateListPreviewProps {
  updates: UpdateInfo[];
  plugins: Plugin[];
}

export function UpdateListPreview({ updates, plugins }: Readonly<UpdateListPreviewProps>) {
  const { tp } = useLocale();

  const pluginByName = new Map(plugins.map((p) => [p.name, p]));

  return (
    <div className="divide-y rounded-lg border">
      {updates.map((u) => {
        const plugin = pluginByName.get(u.name);

        return (
          <div key={u.name} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar className="size-8 shrink-0 rounded-lg">
              {plugin && <AvatarImage src={pluginsApi.getIconUrl(plugin.uid)} />}
              <AvatarFallback className="rounded-lg bg-primary/10">
                <Plug className="size-3.5 text-primary" />
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">
                {plugin ? tp(plugin.name, 'name', plugin.displayName ?? plugin.name) : u.name}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 font-mono text-muted-foreground text-xs">
              <span>{u.currentVersion}</span>
              <ArrowRight className="size-3" />
              <span className="text-blue-600 dark:text-blue-500">{u.latestVersion}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
