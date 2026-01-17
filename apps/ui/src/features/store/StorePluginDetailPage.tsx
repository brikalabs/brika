import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Github,
  Home,
  Package,
  Tag,
  User,
} from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { Markdown } from '@/features/plugins/components/Markdown';
import { useLocale } from '@/lib/use-locale';
import { CompatibilityBadge } from './components/CompatibilityBadge';
import { InstallButton } from './components/InstallButton';
import { VerifiedBadge } from './components/VerifiedBadge';
import { useStorePluginDetails, useStorePluginReadme } from './hooks';

export function StorePluginDetailPage() {
  const { name } = useParams({ strict: false });
  const { t } = useLocale();

  // Decode the package name from URL
  const packageName = name ? decodeURIComponent(name) : '';
  const { data: plugin, isLoading, error } = useStorePluginDetails(packageName, !!packageName);
  const { data: readmeData } = useStorePluginReadme(packageName, !!packageName);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
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
          to="/store"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('store:backToStore')}
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h3 className="font-semibold text-lg">{t('store:plugin.notFound')}</h3>
            <p className="mt-1 text-muted-foreground">
              {t('store:plugin.notFoundDetail', { name: packageName })}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const authorName = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;
  const repoUrl =
    typeof plugin.repository === 'string'
      ? plugin.repository
      : plugin.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');

  function formatDownloads(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/store"
        className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('store:backToStore')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Plugin Icon */}
          <Avatar className="size-16 rounded-xl">
            <AvatarImage src={`/api/registry/plugins/${encodeURIComponent(plugin.name)}/icon`} />
            <AvatarFallback className="rounded-xl bg-primary/10">
              <Package className="size-8 text-primary" />
            </AvatarFallback>
          </Avatar>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-bold text-2xl tracking-tight">{plugin.name}</h1>
              {plugin.verified && <VerifiedBadge />}
              <CompatibilityBadge
                compatible={plugin.compatible}
                reason={plugin.compatibilityReason}
              />
            </div>
            {plugin.description && (
              <p className="mt-2 max-w-2xl text-muted-foreground">{plugin.description}</p>
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
              {plugin.npm?.downloads > 0 && (
                <span className="flex items-center gap-1">
                  <Download className="size-3" />
                  {formatDownloads(plugin.npm.downloads)} {t('store:plugin.downloadsPerWeek')}
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
                  {t('store:labels.repository')}
                  <ExternalLink className="size-3" />
                </a>
              )}
              {plugin.homepage && (
                <a
                  href={plugin.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  <Home className="size-3" />
                  {t('store:labels.homepage')}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="default" asChild>
            <a
              href={`https://www.npmjs.com/package/${plugin.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <ExternalLink className="size-4" />
              {t('store:actions.viewOnNpm')}
            </a>
          </Button>
          <InstallButton plugin={plugin} />
        </div>
      </div>

      {/* Keywords */}
      {plugin.keywords && plugin.keywords.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plugin.keywords.map((kw) => (
            <Badge key={kw} variant="secondary" className="gap-1">
              <Tag className="size-3" />
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {/* Installation Info */}
      {plugin.engines?.brika && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('store:sections.details')}</CardTitle>
            <CardDescription>{t('store:sections.detailsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
              <span className="text-sm">{t('store:labels.packageName')}</span>
              <code className="font-mono text-xs">{plugin.name}</code>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
              <span className="text-sm">{t('store:labels.latestVersion')}</span>
              <code className="font-mono text-xs">{plugin.version}</code>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
              <span className="text-sm">{t('store:labels.brikaCompatibility')}</span>
              <code className="font-mono text-xs">{plugin.engines.brika}</code>
            </div>
            {plugin.license && (
              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
                <span className="text-sm">{t('store:labels.license')}</span>
                <Badge variant="secondary">{plugin.license}</Badge>
              </div>
            )}
            {plugin.installed && (
              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
                <span className="text-sm">{t('store:labels.installedVersion')}</span>
                <Badge variant="default" className="font-mono text-xs">
                  {plugin.installedVersion}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* README */}
      {readmeData?.readme && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              {t('store:sections.readme')}
              {readmeData.filename && (
                <Badge variant="outline" className="ml-auto font-mono text-xs">
                  {readmeData.filename}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{readmeData.readme}</Markdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
