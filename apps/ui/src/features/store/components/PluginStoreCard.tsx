import type { StorePlugin } from '@brika/shared';
import { Link } from '@tanstack/react-router';
import { Download, Package } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, Badge, Card } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { CompatibilityBadge } from './CompatibilityBadge';
import { InstallButton } from './InstallButton';
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
  const { t } = useLocale();
  const accent = plugin.featured ? 'blue' : 'none';
  const authorName = typeof plugin.author === 'string' ? plugin.author : plugin.author.name;

  return (
    <Link to="/store/$name" params={{ name: plugin.name }}>
      <Card accent={accent} interactive className="p-5">
        <div className="flex items-start gap-3">
          {/* Plugin Icon */}
          <Avatar className="size-12 shrink-0 rounded-xl">
            <AvatarImage src={`/api/registry/plugins/${encodeURIComponent(plugin.name)}/icon`} />
            <AvatarFallback className="rounded-xl bg-primary/10">
              <Package className="size-6 text-primary" />
            </AvatarFallback>
          </Avatar>

          {/* Plugin Info */}
          <div className="min-w-0 flex-1">
            {/* First line: Name + Verified badge */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="truncate font-semibold text-sm leading-tight transition-colors group-hover:text-foreground">
                {plugin.name}
              </span>
              {plugin.verified && <VerifiedBadge />}
            </div>

            {/* Second line: Compatibility + Installed badges */}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <CompatibilityBadge
                compatible={plugin.compatible}
                reason={plugin.compatibilityReason}
              />
              {plugin.installed && (
                <Badge variant="default" className="bg-emerald-500 text-xs">
                  {t('store:actions.installed')}
                </Badge>
              )}
            </div>

            {plugin.description && (
              <p className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                {plugin.description}
              </p>
            )}

            {/* Metadata Row */}
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
              {authorName && <span>{authorName}</span>}
              <span>v{plugin.version}</span>
              {plugin.npm.downloads > 0 && (
                <span className="flex items-center gap-1">
                  <Download className="size-3" />
                  {formatDownloads(plugin.npm.downloads)}
                </span>
              )}
            </div>
          </div>

          {/* Top Right: Install Button */}
          <div className="flex shrink-0" onClick={(e) => e.preventDefault()}>
            <InstallButton plugin={plugin} size="icon" variant="ghost" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
