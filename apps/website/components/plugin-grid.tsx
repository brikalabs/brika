'use client';

import { BadgeCheck, Download, Package } from 'lucide-react';
import { useState } from 'react';
import { npm } from '@/lib/config';
import type { Plugin } from '@/lib/plugins';
import { useTilt3D } from '@/lib/use-tilt-3d';
import { cn } from '@/lib/utils';

const MIN_CARDS = 8;

function formatDownloads(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function repeat<T>(items: T[], min: number): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  while (out.length < min) out.push(...items);
  return out;
}

/* ── Icon with fallback ── */
function PluginIcon({
  src,
  name,
}: Readonly<{
  src: string;
  name: string;
}>) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl corner-squircle bg-primary/10">
        <Package className="size-7 text-primary" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={56}
      height={56}
      className="size-14 shrink-0 rounded-2xl corner-squircle bg-muted/50 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/* ── 3D tilt card ── */
function PluginCard({
  plugin,
}: Readonly<{
  plugin: Plugin;
}>) {
  const { ref, onMouseMove, onMouseLeave } = useTilt3D();

  return (
    <a
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={`${npm.packageUrl}/${plugin.name}`}
      target="_blank"
      rel="noopener noreferrer"
      className="tilt-card group relative flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl corner-squircle border border-border bg-surface p-5 will-change-transform"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* Cursor-following glow */}
      <div className="tilt-card-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Shine sweep */}
      <div className="tilt-card-shine pointer-events-none absolute inset-0 overflow-hidden" />

      {/* Header: icon + name */}
      <div className="relative flex items-center gap-3">
        <PluginIcon src={plugin.iconUrl} name={plugin.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{plugin.displayName}</h3>
            {plugin.verified && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/10">
                <BadgeCheck className="size-3.5 text-primary" />
              </span>
            )}
          </div>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground/50">
            {plugin.name}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="relative mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {plugin.description}
      </p>

      {/* Separator + metadata */}
      <div className="relative mt-auto pt-3">
        <div className="mb-3 h-px bg-border/60" />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">v{plugin.version}</span>
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

/* ── Marquee row ── */
function MarqueeRow({
  plugins,
  reverse = false,
  duration = 35,
}: Readonly<{
  plugins: Plugin[];
  reverse?: boolean;
  duration?: number;
}>) {
  const cards = repeat(plugins, MIN_CARDS);

  return (
    <div
      className="marquee-row overflow-hidden"
      style={
        {
          '--marquee-duration': `${duration}s`,
        } as React.CSSProperties
      }
    >
      <div className={cn('marquee-track flex gap-5', reverse && 'marquee-reverse')}>
        {[
          0,
          1,
        ].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-5" aria-hidden={copy === 1}>
            {cards.map((plugin, i) => (
              <PluginCard key={`${copy}-${plugin.name}-${i}`} plugin={plugin} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Grid ── */
export function PluginGrid({
  plugins,
}: Readonly<{
  plugins: Plugin[];
}>) {
  const mid = Math.ceil(plugins.length / 2);
  const row1 = plugins.slice(0, mid);
  const row2 = plugins.slice(mid);

  return (
    <div className="marquee-container space-y-5">
      <MarqueeRow plugins={row1} duration={35} />
      {row2.length > 0 && <MarqueeRow plugins={row2} reverse duration={45} />}
    </div>
  );
}
