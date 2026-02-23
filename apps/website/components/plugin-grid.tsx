'use client';

import { BadgeCheck, ChevronDown, Download, Package } from 'lucide-react';
import { useState } from 'react';
import { npm } from '@/lib/config';
import type { Plugin } from '@/lib/plugins';
import { cn } from '@/lib/utils';

const VISIBLE_COUNT = 6;

function formatDownloads(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function PluginIcon({ src, name }: Readonly<{ src: string; name: string }>) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl corner-squircle bg-primary/10">
        <Package className="size-5 text-primary" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded-xl corner-squircle bg-surface object-contain p-1.5"
      onError={() => setFailed(true)}
    />
  );
}

function PluginCard({ plugin }: Readonly<{ plugin: Plugin }>) {
  return (
    <a
      href={`${npm.packageUrl}/${plugin.name}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-4 rounded-2xl corner-squircle border border-border bg-surface p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      <PluginIcon src={plugin.iconUrl} name={plugin.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{plugin.displayName}</h3>
          {plugin.verified && <BadgeCheck className="size-4 shrink-0 text-primary" />}
        </div>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground/60">
          {plugin.name}
        </span>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {plugin.description}
        </p>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span>v{plugin.version}</span>
          {plugin.downloads > 0 && (
            <span className="flex items-center gap-1">
              <Download className="size-3" />
              {formatDownloads(plugin.downloads)}/wk
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

export function PluginGrid({ plugins }: Readonly<{ plugins: Plugin[] }>) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? plugins : plugins.slice(0, VISIBLE_COUNT);
  const remaining = plugins.length - VISIBLE_COUNT;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((plugin) => (
          <PluginCard key={plugin.name} plugin={plugin} />
        ))}
      </div>

      {remaining > 0 && !expanded && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5',
              'text-sm font-medium transition-colors hover:bg-muted cursor-pointer'
            )}
          >
            Show {remaining} more
            <ChevronDown className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
