import { Badge, Card, CardContent, cn, Skeleton } from '@brika/clay';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Info, Plug, Tag } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import { useDataView } from '@/components/DataView';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import { PluginDetailHeader } from './components';
import { formatPluginError } from './components/plugin-utils';
import { UpdatePluginDialog } from './components/UpdatePluginDialog';
import { usePlugin, usePluginMutations } from './hooks';
import { registryApi, registryKeys } from './registry-api';

export function PluginDetailPage() {
  const params = useParams({
    strict: false,
  });
  const pluginUid = params.uid;
  const navigate = useNavigate();
  const { data: plugin, isLoading, refetch } = usePlugin(pluginUid ?? '');
  const { t, tp } = useLocale();

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const activeTab = params.tab ?? 'overview';

  const { data: updatesData } = useQuery({
    queryKey: registryKeys.updates,
    queryFn: () => registryApi.checkUpdates(),
    staleTime: 5 * 60 * 1000,
  });

  const updateInfo = updatesData?.updates.find((u) => u.name === plugin?.name);
  const { reload, disable, enable, kill, uninstall } = usePluginMutations();

  const isBusy =
    reload.isPending ||
    disable.isPending ||
    enable.isPending ||
    kill.isPending ||
    uninstall.isPending;

  const handleUninstall = async () => {
    if (!plugin) {
      return;
    }
    await uninstall.mutateAsync(plugin.uid);
    navigate({
      to: paths.plugins.list.path,
    });
  };

  const handleUpdateDialogClose = (open: boolean) => {
    setUpdateDialogOpen(open);
    if (!open) {
      refetch();
    }
  };

  const tabLink = (tab: string, isActive: boolean) =>
    cn(
      'relative inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-medium text-sm transition-all',
      isActive
        ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
    );

  const View = useDataView({
    data: plugin,
    isLoading,
  });

  return (
    <View.Root>
      <View.Skeleton>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </View.Skeleton>

      <View.Empty>
        <div className="space-y-6">
          <Link
            to={paths.plugins.list.path}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t('plugins:backToList')}
          </Link>
          <Card>
            <CardContent className="py-12 text-center">
              <Plug className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h3 className="font-semibold text-lg">{t('plugins:notFound')}</h3>
              <p className="mt-1 text-muted-foreground">
                {t('plugins:notFoundDetail', {
                  uid: pluginUid,
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      </View.Empty>

      <View.Content>
        {(plugin) => {
          const hasPages = plugin.pages && plugin.pages.length > 0;

          return (
            <div className="space-y-6">
              <PluginDetailHeader
                plugin={plugin}
                isBusy={isBusy}
                updateAvailable={!!updateInfo?.updateAvailable}
                latestVersion={updateInfo?.latestVersion}
                onUpdate={() => setUpdateDialogOpen(true)}
                onReload={() => reload.mutate(plugin.uid)}
                onDisable={() => disable.mutate(plugin.uid)}
                onEnable={() => enable.mutate(plugin.uid)}
                onKill={() => kill.mutate(plugin.uid)}
                onUninstall={handleUninstall}
              />

              {plugin.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {plugin.keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1">
                      <Tag className="size-3" />
                      {kw}
                    </Badge>
                  ))}
                </div>
              )}

              {plugin.lastError && (
                <div
                  className={cn(
                    'rounded-lg border p-4',
                    plugin.status === 'incompatible'
                      ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'border-destructive/20 bg-destructive/10 text-destructive'
                  )}
                >
                  {formatPluginError(plugin.lastError, t)}
                </div>
              )}

              {hasPages && (
                <div className="border-border border-b">
                  <nav className="flex gap-1">
                    <Link
                      to={paths.plugins.detail.to({
                        uid: pluginUid ?? '',
                      })}
                      className={tabLink('overview', activeTab === 'overview')}
                    >
                      <Info className="size-4" />
                      {t('plugins:tabs.overview')}
                    </Link>
                    {plugin.pages.map((page) => (
                      <Link
                        key={page.id}
                        to={paths.plugins.tab.to({
                          uid: pluginUid ?? '',
                          tab: page.id,
                        })}
                        className={tabLink(page.id, activeTab === page.id)}
                      >
                        <DynamicIcon name={(page.icon ?? 'file') as IconName} className="size-4" />
                        {tp(plugin.name, `pages.${page.id}.name`, page.id)}
                      </Link>
                    ))}
                  </nav>
                </div>
              )}

              <Outlet />

              <UpdatePluginDialog
                open={updateDialogOpen}
                onOpenChange={handleUpdateDialogClose}
                packageName={plugin.name}
                currentVersion={updateInfo?.currentVersion || plugin.version}
                latestVersion={updateInfo?.latestVersion}
                mode="update"
              />
            </div>
          );
        }}
      </View.Content>
    </View.Root>
  );
}
