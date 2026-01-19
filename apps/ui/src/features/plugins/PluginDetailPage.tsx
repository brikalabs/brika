import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowUp,
  Boxes,
  Clock,
  Cpu,
  ExternalLink,
  FileText,
  Github,
  Hash,
  Info,
  MemoryStick,
  Plug,
  Power,
  RefreshCw,
  RotateCcw,
  Skull,
  Tag,
  Trash2,
  User,
} from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import { MetricsChart } from '@/components/ui/chart';
import { Uptime } from '@/components/Uptime';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardIconSmall,
  CardTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { pluginsApi } from './api';
import { Markdown } from './components/Markdown';
import { PluginConfigForm } from './components/PluginConfigForm';
import { UpdatePluginDialog } from './components/UpdatePluginDialog';
import { usePlugin, usePluginMetrics, usePluginMutations, usePluginReadme } from './hooks';
import { registryApi, registryKeys } from './registry-api';

export function PluginDetailPage() {
  const { uid: pluginUid } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: plugin, isLoading, error, refetch } = usePlugin(pluginUid!);
  const { data: readmeData } = usePluginReadme(pluginUid!);

  // Update dialog state
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  // Check for updates
  const { data: updatesData } = useQuery({
    queryKey: registryKeys.updates,
    queryFn: () => registryApi.checkUpdates(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const updateInfo = updatesData?.updates.find((u) => u.name === plugin?.name);

  // Plugin metrics (CPU, memory)
  const { data: metrics } = usePluginMetrics(pluginUid!, plugin?.status === 'running');

  const { reload, disable, enable, kill, uninstall } = usePluginMutations();
  const { t, tp, getLanguageName, formatTime } = useLocale();
  const isBusy =
    reload.isPending ||
    disable.isPending ||
    enable.isPending ||
    kill.isPending ||
    uninstall.isPending;

  // Handle uninstall
  const handleUninstall = async () => {
    if (!plugin) return;
    await uninstall.mutateAsync(plugin.uid);
    navigate({ to: '/plugins' });
  };

  // Extract author name
  const getAuthorName = () => {
    if (!plugin?.author) return null;
    if (typeof plugin.author === 'string') return plugin.author;
    return plugin.author.name;
  };

  // Extract repository URL with directory path for direct linking
  const getRepoUrl = () => {
    if (!plugin?.repository) return null;

    if (typeof plugin.repository === 'string') {
      return plugin.repository;
    }

    return plugin.repository.url;
  };

  // Handle update dialog close with refresh
  const handleUpdateDialogClose = (open: boolean) => {
    setUpdateDialogOpen(open);
    if (!open) {
      // Refresh plugin data after update
      refetch();
    }
  };

  if (isLoading) {
    return (
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
    );
  }

  if (error || !plugin) {
    return (
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
    );
  }

  const authorName = getAuthorName();
  const repoUrl = getRepoUrl();
  const blocks = plugin.blocks ?? [];
  const locales = plugin.locales ?? [];

  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/plugins"
        className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('plugins:backToList')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Plugin Icon */}
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
                  <Github className="size-3" />
                  {t('plugins:details.repository')}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={
              plugin.status === 'running'
                ? 'default'
                : plugin.status === 'crashed'
                  ? 'destructive'
                  : 'secondary'
            }
            className="px-3 py-1"
          >
            {t(`common:status.${plugin.status}`)}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common:actions.refresh')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setUpdateDialogOpen(true)}
                disabled={isBusy}
              >
                <ArrowUp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plugins:actions.update')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => reload.mutate(plugin.uid)}
                disabled={isBusy}
              >
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plugins:actions.reload')}</TooltipContent>
          </Tooltip>

          {plugin.status === 'running' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => disable.mutate(plugin.uid)}
                  disabled={isBusy}
                  className="gap-2"
                >
                  <Power className="size-4" />
                  {t('plugins:actions.disable')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('plugins:actions.disable')}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => enable.mutate(plugin.uid)}
                  disabled={isBusy}
                  className="gap-2"
                >
                  <Power className="size-4" />
                  {t('plugins:actions.enable')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('plugins:actions.enable')}</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="destructive"
                onClick={() => kill.mutate(plugin.uid)}
                disabled={isBusy || plugin.status !== 'running'}
              >
                <Skull className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plugins:actions.kill')}</TooltipContent>
          </Tooltip>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="destructive" disabled={isBusy}>
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('plugins:actions.uninstall')}</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('plugins:uninstall.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('plugins:uninstall.description', { name: plugin.name })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleUninstall}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('plugins:actions.uninstall')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Keywords */}
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

      {/* Error display */}
      {plugin.lastError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <strong>{t('common:labels.error')}:</strong> {plugin.lastError}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card accent="violet" className="p-5">
          <div className="relative flex h-full flex-col justify-center">
            <CardIconSmall className="absolute top-0 right-0">
              <Boxes className="size-4" />
            </CardIconSmall>
            <div className="font-bold text-3xl tracking-tight">{blocks.length}</div>
            <div className="mt-1 text-muted-foreground text-sm">{t('workflows:blocks')}</div>
          </div>
        </Card>

        <Card accent="blue" className="p-5">
          <div className="relative flex h-full flex-col justify-center">
            <CardIconSmall className="absolute top-0 right-0">
              <Hash className="size-4" />
            </CardIconSmall>
            <div className="font-bold font-mono text-3xl tracking-tight">{plugin.pid ?? '-'}</div>
            <div className="mt-1 text-muted-foreground text-sm">{t('plugins:details.pid')}</div>
          </div>
        </Card>

        <Card accent="orange" className="p-5">
          <div className="relative flex h-full flex-col justify-center">
            <CardIconSmall className="absolute top-0 right-0">
              <Clock className="size-4" />
            </CardIconSmall>
            <Uptime startedAt={plugin.startedAt} className="font-bold text-3xl tracking-tight" />
            <div className="mt-1 text-muted-foreground text-sm">
              {plugin.startedAt ? (
                <>
                  {t('plugins:details.startedAt')} {formatTime(plugin.startedAt)}
                </>
              ) : (
                t('plugins:details.uptime')
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Resource metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card accent="emerald" className="p-5">
          <div className="relative flex h-full flex-col">
            <CardIconSmall className="absolute top-0 right-0">
              <Cpu className="size-4" />
            </CardIconSmall>
            <div className="font-bold text-2xl tracking-tight">
              {metrics?.current?.cpu.toFixed(1) ?? '-'}%
            </div>
            <div className="mt-1 text-muted-foreground text-sm">CPU</div>
            <MetricsChart
              data={metrics?.history?.map((h) => ({ ts: h.ts, value: h.cpu })) ?? []}
              color="oklch(0.765 0.177 163.223)"
              formatValue={(v) => `${v.toFixed(1)}%`}
              className="mt-auto pt-3"
            />
          </div>
        </Card>

        <Card accent="purple" className="p-5">
          <div className="relative flex h-full flex-col">
            <CardIconSmall className="absolute top-0 right-0">
              <MemoryStick className="size-4" />
            </CardIconSmall>
            <div className="font-bold text-2xl tracking-tight">
              {metrics?.current ? formatBytes(metrics.current.memory) : '-'}
            </div>
            <div className="mt-1 text-muted-foreground text-sm">Memory</div>
            <MetricsChart
              data={metrics?.history?.map((h) => ({ ts: h.ts, value: h.memory })) ?? []}
              color="oklch(0.714 0.203 305.504)"
              formatValue={formatBytes}
              className="mt-auto pt-3"
            />
          </div>
        </Card>
      </div>

      {/* Blocks Grid */}
      {blocks.length > 0 && (
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
                const blockName = tp(
                  plugin.name,
                  `blocks.${blockKey}.name`,
                  block.name || blockKey
                );
                const blockDesc = tp(
                  plugin.name,
                  `blocks.${blockKey}.description`,
                  block.description
                );

                return (
                  <div
                    key={block.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      <DynamicIcon name={iconName} className="size-5" />
                    </div>
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
      )}

      {/* Plugin Configuration */}
      <PluginConfigForm pluginUid={plugin.uid} pluginName={plugin.name} />

      {/* Reference & Installation Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Info className="size-5 text-primary" />
            {t('plugins:details.installation')}
          </CardTitle>
          <CardDescription>{t('plugins:details.installationDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">UID</span>
            <code className="font-mono text-xs">{plugin.uid}</code>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">{t('plugins:details.directory')}</span>
            <code className="max-w-[60%] truncate font-mono text-xs" title={plugin.rootDirectory}>
              {plugin.rootDirectory}
            </code>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">Entry Point</span>
            <code className="max-w-[60%] truncate font-mono text-xs" title={plugin.entryPoint}>
              {plugin.entryPoint}
            </code>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">{t('plugins:details.compatibleVersion')}</span>
            <code className="font-mono text-xs">{plugin.engines.brika}</code>
          </div>
          {locales.length > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
              <span className="text-sm">{t('plugins:details.languages')}</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {locales.map((loc) => (
                  <Tooltip key={loc}>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="font-mono text-xs uppercase">
                        {loc}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{getLanguageName(loc)}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {plugin.license && (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
              <span className="text-sm">{t('plugins:details.license')}</span>
              <Badge variant="secondary">{plugin.license}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* README */}
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

      {/* Update Dialog */}
      {plugin && (
        <UpdatePluginDialog
          open={updateDialogOpen}
          onOpenChange={handleUpdateDialogClose}
          packageName={plugin.name}
          currentVersion={updateInfo?.currentVersion || plugin.version}
          latestVersion={updateInfo?.latestVersion}
          mode="update"
        />
      )}
    </div>
  );
}
