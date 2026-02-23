import type { Plugin } from '@brika/plugin';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Boxes, LayoutDashboard, Plug, Zap } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, Badge, Card } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { pluginsApi } from '../api';
import { PluginCardActions } from './PluginCardActions';

interface PluginCardProps {
  plugin: Plugin;
  isBusy: boolean;
  onReload: (uid: string) => void;
  onDisable: (uid: string) => void;
  onKill: (uid: string) => void;
}

export function PluginCard({
  plugin: p,
  isBusy,
  onReload,
  onDisable,
  onKill,
}: Readonly<PluginCardProps>) {
  const { t, tp } = useLocale();

  const health = p.status;
  let badgeVariant: 'default' | 'destructive' | 'secondary' = 'secondary';
  if (health === 'running') {
    badgeVariant = 'default';
  } else if (health === 'crashed') {
    badgeVariant = 'destructive';
  }

  return (
    <Link to="/plugins/$uid" params={{ uid: p.uid }}>
      <Card interactive className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="size-12 shrink-0 rounded-xl">
            <AvatarImage src={pluginsApi.getIconUrl(p.uid)} />
            <AvatarFallback className="rounded-xl bg-primary/10">
              <Plug className="size-6 text-primary" />
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-sm leading-tight transition-colors group-hover:text-foreground">
                {tp(p.name, 'name', p.displayName ?? p.name)}
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                v{p.version}
              </Badge>
            </div>
            {p.description && (
              <div className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                {tp(p.name, 'description')}
              </div>
            )}

            {(p.blocks.length > 0 || p.sparks.length > 0 || p.bricks.length > 0) && (
              <div className="mt-2.5 flex items-center gap-3">
                {p.blocks.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
                    <Boxes className="size-3.5" />
                    <span>
                      {p.blocks.length} {t('workflows:blocks').toLowerCase()}
                    </span>
                  </div>
                )}
                {p.sparks.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-amber-600 text-xs dark:text-amber-400">
                    <Zap className="size-3.5" />
                    <span>
                      {p.sparks.length}{' '}
                      {t('common:items.spark', { count: p.sparks.length }).toLowerCase()}
                    </span>
                  </div>
                )}
                {p.bricks.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-blue-600 text-xs dark:text-blue-400">
                    <LayoutDashboard className="size-3.5" />
                    <span>
                      {p.bricks.length}{' '}
                      {t('common:items.brick', { count: p.bricks.length }).toLowerCase()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {p.lastError && (
              <div className="mt-2.5 line-clamp-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-destructive text-xs leading-relaxed">
                {p.lastError}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <Badge
              variant={badgeVariant}
              className={cn(
                'text-xs',
                health === 'running' && 'border-emerald-500/20 bg-success/10 text-success'
              )}
            >
              {t(`common:status.${health}`)}
            </Badge>

            <PluginCardActions
              uid={p.uid}
              isBusy={isBusy}
              onReload={onReload}
              onDisable={onDisable}
              onKill={onKill}
            />
          </div>

          <ArrowRight className="size-4 -translate-x-2 self-center text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
      </Card>
    </Link>
  );
}
