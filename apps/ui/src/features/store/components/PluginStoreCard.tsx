import type { StorePlugin } from '../types';
import { Link } from '@tanstack/react-router';
import { Download, Package, Tag, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, Badge, Card } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { CompatibilityBadge } from './CompatibilityBadge';
import { InstallButton } from './InstallButton';
import { LocalBadge } from './LocalBadge';
import { VerifiedBadge } from './VerifiedBadge';

interface PluginStoreCardProps {
  plugin: StorePlugin;
}

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export function PluginStoreCard({ plugin }: Readonly<PluginStoreCardProps>) {
  const { t, tp } = useLocale();
  const accent = plugin.featured ? 'blue' : 'none';
  const authorName = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;

  return (
    <Link
      to="/store/$source/$"
      params={{ source: plugin.source, _splat: plugin.name }}
      className="group block"
    >
      <Card accent={accent} interactive className="h-full p-5">
        <div className="space-y-3">
          {/* Header: Icon + Title/Badges + Install Button */}
          <div className="flex items-start gap-4">
            {/* Plugin Icon */}
            <Avatar className="size-14 shrink-0 rounded-2xl ring-1 ring-border/50">
              <AvatarImage
                src={`/api/registry/plugins/${encodeURIComponent(plugin.name)}/icon`}
                className="object-cover"
              />
              <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background">
                <Package className="size-7 text-primary/70" />
              </AvatarFallback>
            </Avatar>

            {/* Title + Badges */}
            <div className="min-w-0 flex-1 space-y-2">
              {/* Title + Verified Badge */}
              <div className="flex items-center gap-1.5 overflow-hidden">
                <h3 className="truncate font-semibold text-base leading-tight transition-colors group-hover:text-foreground">
                  {tp(plugin.name, 'name', plugin.displayName ?? plugin.name)}
                </h3>
                {plugin.verified && <VerifiedBadge />}
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-1.5">
                {plugin.source === 'local' && <LocalBadge />}
                <CompatibilityBadge
                  compatible={plugin.compatible}
                  reason={plugin.compatibilityReason}
                />
                {plugin.installed && (
                  <Badge
                    variant="default"
                    className="h-5 bg-emerald-500/10 font-medium text-emerald-700 text-xs dark:bg-emerald-500/20 dark:text-emerald-400"
                  >
                    {t('store:actions.installed')}
                  </Badge>
                )}
              </div>
            </div>

            {/* Install Button */}
            <div
              className="flex shrink-0"
              onClick={(e) => e.preventDefault()}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              aria-hidden="true"
            >
              <InstallButton plugin={plugin} size="icon" variant="ghost" />
            </div>
          </div>

          {/* Description */}
          {plugin.description && (
            <p className="line-clamp-2 text-muted-foreground text-sm leading-relaxed">
              {tp(plugin.name, 'description', plugin.description)}
            </p>
          )}

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground/90 text-xs">
            {authorName && (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <User className="size-3.5 opacity-70" />
                <span>{authorName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Tag className="size-3.5 opacity-70" />
              <span>v{plugin.version}</span>
            </span>
            {plugin.npm.downloads > 0 && (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Download className="size-3.5 opacity-70" />
                <span>{formatDownloads(plugin.npm.downloads)}</span>
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
