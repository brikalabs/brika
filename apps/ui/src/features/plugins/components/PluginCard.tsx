import type { Plugin, PluginHealth } from '@brika/plugin';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowUp, Boxes, LayoutDashboard, Loader2, Plug, Zap } from 'lucide-react';
import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { pluginsApi } from '../api';
import type { UpdateInfo } from '../registry-api';
import { PluginCardActions } from './PluginCardActions';
import { formatPluginError } from './plugin-utils';
import { UpdatePluginDialog } from './UpdatePluginDialog';

interface PluginCardProps {
  plugin: Plugin;
  isBusy: boolean;
  updateInfo?: UpdateInfo;
  onReload: (uid: string) => void;
  onDisable: (uid: string) => void;
  onKill: (uid: string) => void;
}

function getStatusStyle(status: PluginHealth): {
  variant: 'default' | 'destructive' | 'secondary' | 'outline';
  className: string;
} {
  switch (status) {
    case 'running':
      return {
        variant: 'default',
        className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      };
    case 'crashed':
    case 'crash-loop':
      return { variant: 'destructive', className: '' };
    case 'degraded':
    case 'incompatible':
      return {
        variant: 'outline',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      };
    case 'installing':
    case 'updating':
    case 'restarting':
      return {
        variant: 'outline',
        className: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      };
    default:
      return { variant: 'secondary', className: '' };
  }
}

function isTransientStatus(status: PluginHealth) {
  return status === 'installing' || status === 'updating' || status === 'restarting';
}

export function PluginCard({
  plugin: p,
  isBusy,
  updateInfo,
  onReload,
  onDisable,
  onKill,
}: Readonly<PluginCardProps>) {
  const { t, tp } = useLocale();
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false);

  const statusStyle = getStatusStyle(p.status);
  const hasUpdate = updateInfo?.updateAvailable === true;
  const hasCapabilities = p.blocks.length > 0 || p.sparks.length > 0 || p.bricks.length > 0;

  return (
    <>
      <Link to="/plugins/$uid" params={{ uid: p.uid }}>
        <Card interactive className="p-4">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <Avatar className="size-10 shrink-0 rounded-lg">
              <AvatarImage src={pluginsApi.getIconUrl(p.uid)} />
              <AvatarFallback className="rounded-lg bg-primary/10">
                <Plug className="size-5 text-primary" />
              </AvatarFallback>
            </Avatar>

            {/* Name + Description */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-sm">
                  {tp(p.name, 'name', p.displayName ?? p.name)}
                </span>
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                  {p.version}
                </Badge>
                {hasUpdate && (
                  <Badge
                    variant="outline"
                    className="shrink-0 gap-1 border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-500"
                  >
                    <ArrowUp className="size-2.5" />
                    {updateInfo.latestVersion}
                  </Badge>
                )}
              </div>
              {p.status === 'incompatible' && p.lastError ? (
                <p className="mt-0.5 line-clamp-1 text-amber-600 text-xs dark:text-amber-400">
                  {formatPluginError(p.lastError, t)}
                </p>
              ) : (
                p.description && (
                  <p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">
                    {tp(p.name, 'description')}
                  </p>
                )
              )}
            </div>

            {/* Status badge */}
            <Badge
              variant={statusStyle.variant}
              className={cn('shrink-0 gap-1 text-[11px]', statusStyle.className)}
            >
              {isTransientStatus(p.status) && <Loader2 className="size-3 animate-spin" />}
              {t(`common:status.${p.status}`)}
            </Badge>

            {/* Actions — visible on hover */}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {hasUpdate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
                      onClick={(e) => {
                        e.preventDefault();
                        setUpdateDialogOpen(true);
                      }}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('plugins:actions.update')}</TooltipContent>
                </Tooltip>
              )}
              <PluginCardActions
                uid={p.uid}
                isBusy={isBusy}
                onReload={onReload}
                onDisable={onDisable}
                onKill={onKill}
              />
            </div>
          </div>

          {/* Bottom row: capabilities + error */}
          {(hasCapabilities || (p.lastError && p.status !== 'incompatible')) && (
            <div className="mt-2.5 ml-13">
              {hasCapabilities && (
                <div className="flex items-center gap-2">
                  {p.blocks.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Boxes className="size-3" />
                      <span>
                        {p.blocks.length} {t('workflows:blocks').toLowerCase()}
                      </span>
                    </div>
                  )}
                  {p.sparks.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <Zap className="size-3" />
                      <span>
                        {p.sparks.length}{' '}
                        {t('common:items.spark', { count: p.sparks.length }).toLowerCase()}
                      </span>
                    </div>
                  )}
                  {p.bricks.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                      <LayoutDashboard className="size-3" />
                      <span>
                        {p.bricks.length}{' '}
                        {t('common:items.brick', { count: p.bricks.length }).toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {p.lastError && p.status !== 'incompatible' && (
                <div className={cn('flex items-start gap-1.5', hasCapabilities && 'mt-2')}>
                  <AlertTriangle className="mt-px size-3 shrink-0 text-destructive" />
                  <span className="line-clamp-1 text-[11px] text-destructive leading-relaxed">
                    {formatPluginError(p.lastError, t)}
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>
      </Link>

      {hasUpdate && (
        <UpdatePluginDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          packageName={p.name}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          mode="update"
        />
      )}
    </>
  );
}
