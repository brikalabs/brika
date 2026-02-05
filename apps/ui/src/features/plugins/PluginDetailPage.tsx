import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileText, Plug, Tag } from 'lucide-react';
import { useState } from 'react';
import { useDataView } from '@/components/DataView';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import {
  PluginBlocksList,
  PluginDetailHeader,
  PluginInstallInfo,
  PluginMetrics,
  PluginSparksList,
  PluginStats,
} from './components';
import { Markdown } from './components/Markdown';
import { PluginConfigForm } from './components/PluginConfigForm';
import { UpdatePluginDialog } from './components/UpdatePluginDialog';
import { usePlugin, usePluginMetrics, usePluginMutations, usePluginReadme } from './hooks';
import { registryApi, registryKeys } from './registry-api';

export function PluginDetailPage() {
  const { uid: pluginUid } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: plugin, isLoading, refetch } = usePlugin(pluginUid!);
  const { data: readmeData } = usePluginReadme(pluginUid!);
  const { t } = useLocale();

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const { data: updatesData } = useQuery({
    queryKey: registryKeys.updates,
    queryFn: () => registryApi.checkUpdates(),
    staleTime: 5 * 60 * 1000,
  });

  const updateInfo = updatesData?.updates.find((u) => u.name === plugin?.name);
  const { data: metrics } = usePluginMetrics(pluginUid!, plugin?.status === 'running');
  const { reload, disable, enable, kill, uninstall } = usePluginMutations();

  const isBusy =
    reload.isPending ||
    disable.isPending ||
    enable.isPending ||
    kill.isPending ||
    uninstall.isPending;

  const handleUninstall = async () => {
    if (!plugin) return;
    await uninstall.mutateAsync(plugin.uid);
    navigate({ to: '/plugins' });
  };

  const handleUpdateDialogClose = (open: boolean) => {
    setUpdateDialogOpen(open);
    if (!open) refetch();
  };

  const View = useDataView({ data: plugin, isLoading });

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
            to="/plugins"
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
                {t('plugins:notFoundDetail', { uid: pluginUid })}
              </p>
            </CardContent>
          </Card>
        </div>
      </View.Empty>

      <View.Content>
        {(plugin) => (
          <div className="space-y-6">
            <PluginDetailHeader
              plugin={plugin}
              isBusy={isBusy}
              onRefresh={() => refetch()}
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
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
                <strong>{t('common:labels.error')}:</strong> {plugin.lastError}
              </div>
            )}

            <PluginStats plugin={plugin} />
            <PluginMetrics metrics={metrics} />
            <PluginBlocksList plugin={plugin} />
            <PluginSparksList plugin={plugin} />
            <PluginConfigForm pluginUid={plugin.uid} pluginName={plugin.name} />
            <PluginInstallInfo plugin={plugin} />

            {readmeData?.readme && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="size-5 text-primary" />
                    {t('plugins:details.readme')}
                    <Badge variant="outline" className="ml-auto font-mono text-xs">
                      {readmeData.filename}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Markdown>{readmeData.readme}</Markdown>
                </CardContent>
              </Card>
            )}

            <UpdatePluginDialog
              open={updateDialogOpen}
              onOpenChange={handleUpdateDialogClose}
              packageName={plugin.name}
              currentVersion={updateInfo?.currentVersion || plugin.version}
              latestVersion={updateInfo?.latestVersion}
              mode="update"
            />
          </div>
        )}
      </View.Content>
    </View.Root>
  );
}
