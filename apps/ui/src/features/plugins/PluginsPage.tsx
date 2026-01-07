import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Boxes,
  Loader2,
  Plug,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Skull,
} from 'lucide-react';
import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { pluginsApi } from './api';
import { InstallPluginDialog, UpdateAllButton } from './components';
import { usePluginMutations, usePlugins } from './hooks';

export function PluginsPage() {
  const { t, tp } = useLocale();
  const { data: plugins = [], isLoading, refetch } = usePlugins();
  const { disable, reload, kill } = usePluginMutations();
  const [installDialogOpen, setInstallDialogOpen] = React.useState(false);

  const isBusy = disable.isPending || reload.isPending || kill.isPending;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="bg-linear-to-r from-foreground to-foreground/70 bg-clip-text font-bold text-3xl tracking-tight">
            {t('plugins:title')}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-muted-foreground">
            <Plug className="size-4" />
            {t('plugins:subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
            {t('common:actions.refresh')}
          </Button>
          <UpdateAllButton />
          <Button className="gap-2" onClick={() => setInstallDialogOpen(true)}>
            <Plus className="size-4" />
            {t('plugins:actions.load')}
          </Button>
          <InstallPluginDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : plugins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h3 className="font-semibold text-lg">{t('plugins:empty')}</h3>
            <p className="mt-1 text-muted-foreground">{t('plugins:emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {plugins.map((p) => {
            const health = p.status;
            const accent =
              health === 'running' ? 'blue' : health === 'crashed' ? 'orange' : undefined;
            return (
              <Link key={p.uid} to="/plugins/$uid" params={{ uid: p.uid }}>
                <Card accent={accent} interactive className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Plugin Icon */}
                    <Avatar className="size-12 shrink-0 rounded-xl">
                      <AvatarImage src={pluginsApi.getIconUrl(p.uid)} />
                      <AvatarFallback className="rounded-xl bg-primary/10">
                        <Plug className="size-6 text-primary" />
                      </AvatarFallback>
                    </Avatar>

                    {/* Plugin Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold transition-colors group-hover:text-foreground">
                          {tp(p.name, 'name')}
                        </span>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          v{p.version}
                        </Badge>
                      </div>
                      {p.description && (
                        <div className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
                          {tp(p.name, 'description')}
                        </div>
                      )}

                      {/* Stats Row */}
                      {p.blocks.length > 0 && (
                        <div className="mt-2 flex gap-4">
                          {p.blocks.length > 0 && (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                              <Boxes className="size-3.5" />
                              <span>
                                {p.blocks.length} {t('workflows:blocks').toLowerCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error Display */}
                      {p.lastError && (
                        <div className="mt-2 rounded-lg bg-destructive/10 p-2 text-destructive text-xs">
                          {p.lastError}
                        </div>
                      )}
                    </div>

                    {/* Right Side: Status + Actions */}
                    <div className="flex shrink-0 flex-col items-end gap-3">
                      <Badge
                        variant={
                          health === 'running'
                            ? 'default'
                            : health === 'crashed'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className={cn(
                          health === 'running' &&
                            'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                        )}
                      >
                        {t(`common:status.${health}`)}
                      </Badge>

                      <div className="flex gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={(e) => {
                                e.preventDefault();
                                reload.mutate(p.uid);
                              }}
                              disabled={isBusy}
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('plugins:actions.reload')}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={(e) => {
                                e.preventDefault();
                                disable.mutate(p.uid);
                              }}
                              disabled={isBusy}
                            >
                              <Power className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('plugins:actions.disable')}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                kill.mutate(p.uid);
                              }}
                              disabled={isBusy}
                            >
                              <Skull className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('plugins:actions.kill')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <ArrowRight className="size-5 -translate-x-2 self-center text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
