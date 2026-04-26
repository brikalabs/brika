import { Avatar, AvatarFallback, AvatarImage, Badge, Button } from '@brika/clay';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Code2, Download, ExternalLink, Home, Package, Tag, User } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import type { StorePlugin } from '../types';
import { CompatibilityBadge } from './CompatibilityBadge';
import { InstallButton } from './InstallButton';
import { LocalBadge } from './LocalBadge';
import { VerifiedBadge } from './VerifiedBadge';

interface StorePluginHeaderProps {
  plugin: StorePlugin;
}

function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

export function StorePluginHeader({ plugin }: Readonly<StorePluginHeaderProps>) {
  const { t, tp } = useLocale();

  const authorName = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;
  const repoUrl =
    typeof plugin.repository === 'string'
      ? plugin.repository
      : plugin.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');

  return (
    <>
      {/* Back link */}
      <Link
        to={paths.store.list.path}
        className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('store:backToStore')}
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar className="size-16 rounded-xl">
              <AvatarImage src={`/api/registry/plugins/${encodeURIComponent(plugin.name)}/icon`} />
              <AvatarFallback className="rounded-xl bg-primary/10">
                <Package className="size-8 text-primary" />
              </AvatarFallback>
            </Avatar>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-bold text-2xl tracking-tight">
                  {tp(plugin.name, 'name', plugin.displayName ?? plugin.name)}
                </h1>
                {plugin.source === 'local' && <LocalBadge />}
                {plugin.verified && <VerifiedBadge />}
                <CompatibilityBadge
                  compatible={plugin.compatible}
                  reason={plugin.compatibilityReason}
                />
              </div>
              <code className="font-mono text-muted-foreground text-xs">{plugin.name}</code>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {plugin.source !== 'local' && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.npmjs.com/package/${plugin.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5"
                >
                  <ExternalLink className="size-3.5" />
                  {t('store:actions.viewOnNpm')}
                </a>
              </Button>
            )}
            <InstallButton plugin={plugin} />
          </div>
        </div>

        {plugin.description && (
          <p className="text-muted-foreground">
            {tp(plugin.name, 'description', plugin.description)}
          </p>
        )}

        <div className="flex flex-wrap gap-3 text-muted-foreground text-sm">
          <Badge variant="outline" className="gap-1">
            v{plugin.version}
          </Badge>
          {authorName && (
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {authorName}
            </span>
          )}
          {plugin.npm.downloads > 0 && (
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
              <Code2 className="size-3" />
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
    </>
  );
}
