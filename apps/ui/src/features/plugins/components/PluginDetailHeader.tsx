import { Link } from '@tanstack/react-router';
import { ArrowLeft, Code2, ExternalLink, Plug, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, Badge } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';
import { pluginsApi } from '../api';
import { PluginHeaderActions } from './PluginHeaderActions';
import { getAuthorName, getRepoUrl } from './plugin-utils';

interface PluginDetailHeaderProps {
  plugin: Plugin;
  isBusy: boolean;
  onRefresh: () => void;
  onUpdate: () => void;
  onReload: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onKill: () => void;
  onUninstall: () => void;
}

export function PluginDetailHeader({
  plugin,
  isBusy,
  onRefresh,
  onUpdate,
  onReload,
  onDisable,
  onEnable,
  onKill,
  onUninstall,
}: Readonly<PluginDetailHeaderProps>) {
  const { t, tp } = useLocale();

  const authorName = getAuthorName(plugin);
  const repoUrl = getRepoUrl(plugin);

  return (
    <>
      <Link
        to="/plugins"
        className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('plugins:backToList')}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 rounded-xl">
            <AvatarImage src={pluginsApi.getIconUrl(plugin.uid)} />
            <AvatarFallback className="rounded-xl bg-primary/10">
              <Plug className="size-8 text-primary" />
            </AvatarFallback>
          </Avatar>

          <div>
            <h1 className="font-bold text-2xl tracking-tight">{tp(plugin.name, 'name')}</h1>
            <code className="font-mono text-muted-foreground text-xs">{plugin.name}</code>
            {plugin.description && (
              <p className="mt-1 text-muted-foreground">{tp(plugin.name, 'description')}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-muted-foreground text-sm">
              <Badge variant="outline" className="gap-1">
                v{plugin.version}
              </Badge>
              {authorName && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {authorName}
                </span>
              )}
              {repoUrl && (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  <Code2 className="size-3" />
                  {t('plugins:details.repository')}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <PluginHeaderActions
          pluginName={plugin.name}
          status={plugin.status}
          isBusy={isBusy}
          onRefresh={onRefresh}
          onUpdate={onUpdate}
          onReload={onReload}
          onDisable={onDisable}
          onEnable={onEnable}
          onKill={onKill}
          onUninstall={onUninstall}
        />
      </div>
    </>
  );
}
