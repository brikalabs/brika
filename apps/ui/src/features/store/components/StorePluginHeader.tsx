import type { StorePlugin } from '@brika/shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Download, ExternalLink, Github, Home, Package, Tag, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, Badge, Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { CompatibilityBadge } from './CompatibilityBadge';
import { InstallButton } from './InstallButton';
import { VerifiedBadge } from './VerifiedBadge';

interface StorePluginHeaderProps {
  plugin: StorePlugin;
}

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export function StorePluginHeader({ plugin }: StorePluginHeaderProps) {
  const { t } = useLocale();

  const authorName = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;
  const repoUrl =
    typeof plugin.repository === 'string'
      ? plugin.repository
      : plugin.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');

  return (
    <>
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
    </>
  );
}
