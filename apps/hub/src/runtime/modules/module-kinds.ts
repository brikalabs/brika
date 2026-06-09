import { join } from 'node:path';
import { CLIENT_CHUNK_PREFIX } from '@brika/compiler';
import type { PluginPackageSchema } from '@brika/schema';

export { CLIENT_CHUNK_PREFIX } from '@brika/compiler';

/** On-disk cache directory (relative to a plugin's cache root) holding shared chunks. */
export const CHUNK_DIR = '_chunks';

/** The manifest fields that declare compiled client modules. */
export type ManifestModules = Pick<PluginPackageSchema, 'pages' | 'bricks' | 'blocks'>;

/**
 * A client module kind (page, brick, block view).
 *
 * Adding a new kind of compiled client module is a single entry in
 * {@link MODULE_KINDS} below: the compiler, the serving route, the DTO URL
 * builders and the prune logic all iterate this registry instead of branching
 * on kind.
 */
export interface ModuleKind {
  /** Stable kind name. Appears in serving URLs and as the `:kind` route param. */
  readonly name: string;
  /**
   * Cache key relative to the plugin (e.g. `bricks/player`).
   *
   * MUST stay stable: it is also the on-disk cache path. Changing an existing
   * kind's pattern invalidates persisted caches on upgrade.
   */
  cacheKey(id: string): string;
  /** Entry path relative to `<root>/src` (e.g. `bricks/player.tsx`). */
  entryRel(id: string): string;
  /** Module ids a plugin declares for this kind, read from its manifest. */
  select(metadata: ManifestModules): string[];
}

export const MODULE_KINDS = {
  page: {
    name: 'page',
    cacheKey: (id) => `pages/${id}`,
    entryRel: (id) => join('pages', `${id}.tsx`),
    select: (m) => (m.pages ?? []).map((p) => p.id),
  },
  brick: {
    name: 'brick',
    cacheKey: (id) => `bricks/${id}`,
    entryRel: (id) => join('bricks', `${id}.tsx`),
    select: (m) => (m.bricks ?? []).map((b) => b.id),
  },
  blockView: {
    name: 'blockView',
    cacheKey: (id) => `blocks/${id}.view`,
    entryRel: (id) => join('blocks', `${id}.view.tsx`),
    select: (m) => (m.blocks ?? []).filter((b) => b.view).map((b) => b.id),
  },
  // Node-body display surface: `src/blocks/<id>.node.tsx`, rendered inside the
  // block node on the canvas (text, image, live previews).
  blockNode: {
    name: 'blockNode',
    cacheKey: (id) => `blocks/${id}.node`,
    entryRel: (id) => join('blocks', `${id}.node.tsx`),
    select: (m) => (m.blocks ?? []).filter((b) => b.nodeView).map((b) => b.id),
  },
} as const satisfies Record<string, ModuleKind>;

export const moduleKindList: ModuleKind[] = Object.values(MODULE_KINDS);

const kindByName = new Map<string, ModuleKind>(moduleKindList.map((k) => [k.name, k]));

/** Resolve a kind by its URL name. Undefined means an unknown kind (serve 404). */
export function getModuleKind(name: string): ModuleKind | undefined {
  return kindByName.get(name);
}

/** Full module URL the UI fetches. Kind + content hash keep it cache-bustable. */
export function moduleUrl(pluginUid: string, kind: ModuleKind, id: string, hash: string): string {
  return `/api/modules/${encodeURIComponent(pluginUid)}/${kind.name}/${id}.${hash}.js`;
}

/**
 * Stable `<plugin>:<cacheKey>` id for a module. Used as the compiler cache key,
 * the CSS injection scope (hub), and the `data-brika-scope` attribute (UI).
 */
export function moduleScopeId(pluginName: string, kind: ModuleKind, id: string): string {
  return `${pluginName}:${kind.cacheKey(id)}`;
}

/** True when a served `id` names a shared code chunk rather than a module. */
export function isChunkId(id: string): boolean {
  return id.startsWith(CLIENT_CHUNK_PREFIX);
}

/** On-disk cache path (relative to the plugin cache root) for a shared chunk. */
export function chunkCacheKey(chunkName: string): string {
  return `${CHUNK_DIR}/${chunkName}`;
}

/**
 * In-memory cache key for a shared chunk. Kind-independent: a chunk may be
 * imported by entries of several kinds, so it lives in one per-plugin namespace
 * and the serving route resolves `_brika_chunk_*` requests here regardless of
 * the `:kind` URL segment.
 */
export function chunkScopeId(pluginName: string, chunkName: string): string {
  return `${pluginName}:${chunkCacheKey(chunkName)}`;
}

/** Minimal compiler surface needed to look up a compiled module's hash. */
interface ModuleEntryLookup {
  get(key: string): { hash: string } | undefined;
}

/**
 * Resolve the public URL of a compiled module, or undefined when it has not
 * been compiled (e.g. the plugin ships no source for this kind).
 */
export function resolveModuleUrl(
  compiler: ModuleEntryLookup,
  pluginName: string,
  pluginUid: string,
  kind: ModuleKind,
  id: string
): string | undefined {
  const entry = compiler.get(moduleScopeId(pluginName, kind, id));
  return entry ? moduleUrl(pluginUid, kind, id, entry.hash) : undefined;
}
