/**
 * Shared grant-rendering primitives used by both the post-install consent UI
 * (PluginPermissions) and the store-page preview card (PluginGrantsPreview).
 *
 * Everything here is read-only / display-only. The consent UI adds toggles on
 * top of these building blocks; the preview card shows them without toggles.
 */

import { Badge } from '@brika/clay';
import {
  EthernetPort,
  Folder,
  Globe,
  Globe2,
  KeyRound,
  type LucideIcon,
  MapPin,
  MousePointerClick,
  Plug,
  Server,
  Shield,
} from 'lucide-react';
import { z } from 'zod';

// ─── Icon map ────────────────────────────────────────────────────────────────

export const PERMISSION_ICON_MAP: Record<string, LucideIcon> = {
  dns: Globe2,
  'ethernet-port': EthernetPort,
  folder: Folder,
  globe: Globe,
  'globe-2': Globe2,
  'key-round': KeyRound,
  'map-pin': MapPin,
  'mouse-pointer-square': MousePointerClick,
  plug: Plug,
  server: Server,
};

/** Fallback icon for unrecognised permission families */
export const FallbackPermissionIcon: LucideIcon = Shield;

// ─── Inline scope schemas ─────────────────────────────────────────────────────

export const AllowScopeSchema = z.object({ allow: z.array(z.string()) });

export const LocalNetScopeSchema = z.object({ allowLoopbackPorts: z.array(z.number()) });

export const FsScopeSchema = z.object({
  read: z.array(z.string()).default([]),
  write: z.array(z.string()).default([]),
});

export const UiScopeSchema = z.object({
  acceptFilters: z.array(z.string()).default([]),
});

// ─── Data helpers ─────────────────────────────────────────────────────────────

/**
 * Return every grant entry whose family segment (index 2 of the reverse-DNS
 * id) matches the given family name.
 *
 * e.g. family="net" matches "dev.brika.net.fetch"
 */
export function grantsForFamily(
  grants: Record<string, unknown>,
  family: string
): [string, unknown][] {
  return Object.entries(grants).filter(([id]) => {
    const segments = id.split('.');
    return segments[2] === family;
  });
}

/**
 * Merge `allow` arrays from multiple grants into a de-duplicated sorted list.
 * Returns null when no grants carry this shape (nothing to display).
 */
export function mergeAllowLists(entries: [string, unknown][]): string[] | null {
  const hosts = new Set<string>();
  let anyParsed = false;

  for (const [, scope] of entries) {
    const result = AllowScopeSchema.safeParse(scope);
    if (result.success) {
      anyParsed = true;
      for (const host of result.data.allow) {
        hosts.add(host);
      }
    }
  }

  if (!anyParsed || hosts.size === 0) {
    return null;
  }

  return [...hosts].sort((a, b) => a.localeCompare(b));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Renders a single hostname chip. Wildcard entries (`*.example.com`) get a
 * slightly different visual treatment — an asterisk prefix in muted tone so
 * they stand out from literal hosts.
 */
export function HostChip({ host }: Readonly<{ host: string }>) {
  const isWildcard = host.startsWith('*.');

  if (isWildcard) {
    return (
      <Badge variant="outline" className="gap-0.5 border-dashed font-mono text-xs" title={host}>
        <span className="text-muted-foreground">*.</span>
        <span>{host.slice(2)}</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="font-mono text-xs">
      {host}
    </Badge>
  );
}

/**
 * Scope detail for net / ws / dns families — a labelled row of host chips.
 */
export function HostScopeDetail({ hosts, label }: Readonly<{ hosts: string[]; label: string }>) {
  if (hosts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 pt-1.5">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap gap-1">
        {hosts.map((host) => (
          <HostChip key={host} host={host} />
        ))}
      </div>
    </div>
  );
}

/**
 * Scope detail for the fs family — groups patterns by access mode, showing
 * the union of read-only and read-write paths separately.
 */
export function FsScopeDetail({
  grants,
  readLabel,
  readwriteLabel,
  pathsLabel,
}: Readonly<{
  grants: [string, unknown][];
  readLabel: string;
  readwriteLabel: string;
  pathsLabel: string;
}>) {
  const readPaths = new Set<string>();
  const readwritePaths = new Set<string>();

  for (const [, scope] of grants) {
    const result = FsScopeSchema.safeParse(scope);
    if (result.success) {
      for (const p of result.data.read) {
        readPaths.add(p);
      }
      for (const p of result.data.write) {
        // write implies read — show under readwrite, not duplicated in read
        readPaths.delete(p);
        readwritePaths.add(p);
      }
    }
  }

  const readArr = [...readPaths].sort((a, b) => a.localeCompare(b));
  const rwArr = [...readwritePaths].sort((a, b) => a.localeCompare(b));

  if (readArr.length === 0 && rwArr.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 pt-1.5">
      <span className="text-muted-foreground text-xs">{pathsLabel}</span>
      {rwArr.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-400">
            {readwriteLabel}
          </span>
          {rwArr.map((p) => (
            <Badge key={p} variant="outline" className="font-mono text-xs">
              {p}
            </Badge>
          ))}
        </div>
      )}
      {readArr.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
            {readLabel}
          </span>
          {readArr.map((p) => (
            <Badge key={p} variant="outline" className="font-mono text-xs">
              {p}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Scope detail for the ui family — shows allowed file-filter patterns (MIME
 * types or extensions) when the plugin declares them. Empty `acceptFilters`
 * means "any file" — we omit the row rather than showing a cryptic empty list.
 */
export function UiScopeDetail({
  grants,
  filtersLabel,
}: Readonly<{ grants: [string, unknown][]; filtersLabel: string }>) {
  const filters = new Set<string>();

  for (const [, scope] of grants) {
    const result = UiScopeSchema.safeParse(scope);
    if (result.success) {
      for (const f of result.data.acceptFilters) {
        filters.add(f);
      }
    }
  }

  if (filters.size === 0) {
    return null;
  }

  const filterArr = [...filters].sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 pt-1.5">
      <span className="shrink-0 text-muted-foreground text-xs">{filtersLabel}</span>
      <div className="flex flex-wrap gap-1">
        {filterArr.map((f) => (
          <Badge key={f} variant="secondary" className="font-mono text-xs">
            {f}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ─── Scope detail dispatcher ─────────────────────────────────────────────────

export interface ScopeDetailProps {
  family: string;
  grants: Record<string, unknown>;
  hostsLabel: string;
  pathsLabel: string;
  filtersLabel: string;
  readLabel: string;
  readwriteLabel: string;
}

/**
 * Consented loopback ports across all net.local grants, as localhost:<port>
 * chips. netLocal's grant id is dev.brika.net.local.fetch (family segment
 * 'net'), so match by id prefix rather than the family segment.
 */
function localNetHosts(grants: Record<string, unknown>): string[] {
  const ports = new Set<number>();
  for (const [id, scope] of Object.entries(grants)) {
    if (!id.startsWith('dev.brika.net.local.')) {
      continue;
    }
    const result = LocalNetScopeSchema.safeParse(scope);
    if (result.success) {
      for (const port of result.data.allowLoopbackPorts) {
        ports.add(port);
      }
    }
  }
  return [...ports].sort((a, b) => a - b).map((p) => `localhost:${p}`);
}

export function ScopeDetail({
  family,
  grants,
  hostsLabel,
  pathsLabel,
  filtersLabel,
  readLabel,
  readwriteLabel,
}: Readonly<ScopeDetailProps>) {
  const familyGrants = grantsForFamily(grants, family);

  if (family === 'net' || family === 'ws' || family === 'dns') {
    const hosts = mergeAllowLists(familyGrants);
    if (!hosts) {
      return null;
    }
    return <HostScopeDetail hosts={hosts} label={hostsLabel} />;
  }

  if (family === 'netLocal') {
    const hosts = localNetHosts(grants);
    return hosts.length > 0 ? <HostScopeDetail hosts={hosts} label={hostsLabel} /> : null;
  }

  if (family === 'fs') {
    return (
      <FsScopeDetail
        grants={familyGrants}
        readLabel={readLabel}
        readwriteLabel={readwriteLabel}
        pathsLabel={pathsLabel}
      />
    );
  }

  if (family === 'ui') {
    return <UiScopeDetail grants={familyGrants} filtersLabel={filtersLabel} />;
  }

  // location / secrets: empty scope, nothing to display
  return null;
}
