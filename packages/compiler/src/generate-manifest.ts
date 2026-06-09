/**
 * Manifest generation for `brika build`.
 *
 * Blocks, sparks, and react-free `*.brick.ts` descriptors are server modules:
 * importing them runs their `define*` calls under an installed collector. Bricks
 * can also live in a single `*.tsx` that exports both a `defineBrick` descriptor
 * and the default view, or (legacy) co-locate plain `meta`/`config` exports;
 * both are read via {@link readBrowserModule} (a `Bun.build` pass that stubs
 * react and keeps `@brika/sdk` external). A single-file `.tsx` brick is only
 * safe when no server module imports its descriptor (otherwise react leaks into
 * the plugin subprocess), so bricks that push data keep the descriptor in a
 * `*.brick.ts`. All are lowered into the `blocks[]` / `sparks[]` / `bricks[]` /
 * `pages[]` shapes the hub reads from `package.json`. The hub contract is
 * unchanged: this only generates the committed arrays.
 */

import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type BrickMetaInput,
  type CollectedBlock,
  type CollectedBrick,
  type CollectedManifest,
  type CollectedSpark,
  drainCollector,
  installBuildContext,
  installCollector,
  isZodSchema,
  type PreferenceEntry,
  parseBrickMeta,
  zodToPreferences,
} from '@brika/sdk/collect';
import { z } from 'zod';
import { errorMessage, readBrowserModule } from './browser-extract';
import { blockFiles, brickDescriptorFiles, brickFiles, pageFiles, sparkFiles } from './scan';
import type { ValidationDiagnostic } from './validate';

/** A generated manifest `blocks[]` entry (mirrors `@brika/schema` BlockSchema). */
export interface GeneratedBlock {
  id: string;
  name?: string;
  description?: string;
  category: string;
  icon?: string;
  color?: string;
  view?: boolean;
  nodeView?: boolean;
}

/** A generated manifest `sparks[]` entry (mirrors `@brika/schema` SparkSchema). */
export interface GeneratedSpark {
  id: string;
  name?: string;
  description?: string;
}

/** A generated manifest `bricks[]` entry (mirrors `@brika/schema` BrickSchema). */
export interface GeneratedBrick {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  families?: Array<'sm' | 'md' | 'lg'>;
  config?: PreferenceEntry[];
}

/** A generated manifest `pages[]` entry (mirrors `@brika/schema` PageSchema). */
export interface GeneratedPage {
  id: string;
  icon?: string;
}

export interface GeneratedManifest {
  blocks: GeneratedBlock[];
  sparks: GeneratedSpark[];
  bricks: GeneratedBrick[];
  pages: GeneratedPage[];
  diagnostics: ValidationDiagnostic[];
  /** False when any diagnostic is an error. */
  ok: boolean;
}

/** Bumped per dynamic import so repeated builds in one process re-run modules. */
let importSalt = 0;

interface ImportResult {
  collected: CollectedManifest;
  errors: ValidationDiagnostic[];
}

/** Import each module under an installed collector and return what it captured. */
async function importModules(files: readonly string[]): Promise<ImportResult> {
  const errors: ValidationDiagnostic[] = [];
  // A no-op prelude bridge so modules that reach getContext() at import time
  // (e.g. defineOAuth registering routes) run their define* calls without a hub.
  installBuildContext();
  installCollector();
  for (const file of files) {
    importSalt += 1;
    try {
      await import(`${pathToFileURL(file).href}?brika-build=${importSalt}`);
    } catch (err) {
      errors.push({
        level: 'error',
        message: `Failed to import ${file}: ${errorMessage(err)}`,
        file,
      });
    }
  }
  return { collected: drainCollector(), errors };
}

/** Keep the first definition for each id; later duplicates are ignored. */
function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

async function toBlockEntry(
  pluginRoot: string,
  block: CollectedBlock & { meta: NonNullable<CollectedBlock['meta']> }
): Promise<GeneratedBlock> {
  const { id, meta } = block;
  const [hasView, hasNode] = await Promise.all([
    Bun.file(join(pluginRoot, 'src', 'blocks', `${id}.view.tsx`)).exists(),
    Bun.file(join(pluginRoot, 'src', 'blocks', `${id}.node.tsx`)).exists(),
  ]);
  // undefined fields drop out of the manifest (JSON.stringify omits them).
  return {
    id,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    icon: meta.icon,
    color: meta.color,
    view: hasView || undefined,
    nodeView: hasNode || undefined,
  };
}

function toSparkEntry(spark: CollectedSpark): GeneratedSpark {
  return { id: spark.id, name: spark.meta?.name, description: spark.meta?.description };
}

function toBrickEntry(
  id: string,
  meta: BrickMetaInput,
  config: PreferenceEntry[] | undefined
): GeneratedBrick {
  return {
    id,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    icon: meta.icon,
    color: meta.color,
    families: meta.families,
    config,
  };
}

/** Lower a list of `zodToPreferences` warnings into per-brick diagnostics. */
function pushZodWarnings(
  diagnostics: ValidationDiagnostic[],
  id: string,
  warnings: readonly string[],
  file: string
): void {
  for (const warning of warnings) {
    diagnostics.push({ level: 'warning', message: `Brick "${id}": ${warning}`, file });
  }
}

/** Lower a brick's `config` zod export, routing warnings into diagnostics. */
function brickConfig(
  id: string,
  file: string,
  value: unknown,
  diagnostics: ValidationDiagnostic[]
): PreferenceEntry[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isZodSchema(value)) {
    diagnostics.push({
      level: 'error',
      message: `Brick "${id}" config export is not a zod schema`,
      file,
    });
    return undefined;
  }
  const { preferences, warnings } = zodToPreferences(value);
  pushZodWarnings(diagnostics, id, warnings, file);
  return preferences.length > 0 ? preferences : undefined;
}

const isFunction = (value: unknown): boolean => typeof value === 'function';

/**
 * Shape of a single-file brick's `defineBrick` descriptor as it appears among
 * the module's exports: a string `id`, a `meta` object, a zod `config` (checked
 * with the SDK's own `isZodSchema` so it stays the same zod instance), and a
 * `data` channel exposing `set`/`use`. Unrelated exports (the default view, a
 * legacy `meta` constant) fail to parse and are skipped.
 */
const brickDescriptorSchema = z.object({
  id: z.string(),
  meta: z.record(z.string(), z.unknown()),
  config: z.custom(isZodSchema),
  data: z.object({ set: z.custom(isFunction), use: z.custom(isFunction) }),
});

/** The descriptor fields the manifest lowering consumes. */
type ExportedBrickDescriptor = Pick<
  z.infer<typeof brickDescriptorSchema>,
  'id' | 'meta' | 'config'
>;

/** Find the first export matching the `defineBrick` descriptor shape, if any. */
function findBrickDescriptor(ns: Record<string, unknown>): ExportedBrickDescriptor | undefined {
  for (const value of Object.values(ns)) {
    const parsed = brickDescriptorSchema.safeParse(value);
    if (parsed.success) {
      const { id, meta, config } = parsed.data;
      return { id, meta, config };
    }
  }
  return undefined;
}

/**
 * Build the `bricks[]` entries from `.tsx` files. A single-file brick exports a
 * `defineBrick` descriptor (preferred); a legacy view co-locates plain `meta`
 * (required) and `config` (optional zod) exports. A brick with neither is an
 * error so `brika build` refuses rather than silently dropping it.
 */
async function buildBricks(
  files: readonly string[],
  diagnostics: ValidationDiagnostic[]
): Promise<GeneratedBrick[]> {
  const bricks: GeneratedBrick[] = [];
  for (const file of files) {
    const fileId = basename(file, '.tsx');
    const loaded = await readBrowserModule(file);
    if ('error' in loaded) {
      diagnostics.push({
        level: 'error',
        message: `Failed to read brick "${fileId}": ${loaded.error}`,
        file,
      });
      continue;
    }
    const { ns } = loaded;
    const descriptor = findBrickDescriptor(ns);
    // A descriptor's id is authoritative and must match the file, since the host
    // loads the view by manifest id from `<id>.tsx`.
    if (descriptor && descriptor.id !== fileId) {
      diagnostics.push({
        level: 'error',
        message: `Brick "${descriptor.id}" descriptor lives in ${fileId}.tsx; rename the file to ${descriptor.id}.tsx so the host can load the view`,
        file,
      });
      continue;
    }
    const metaSource = descriptor ? descriptor.meta : ns.meta;
    const configSource = descriptor ? descriptor.config : ns.config;
    if (metaSource === undefined) {
      diagnostics.push({
        level: 'error',
        message: `Brick "${fileId}" has no defineBrick descriptor or meta export; export \`defineBrick({ ... })\` (or \`export const meta = { ... }\`) so brika build can manage its manifest entry`,
        file,
      });
      continue;
    }
    const parsed = parseBrickMeta(metaSource);
    if (!parsed.ok) {
      diagnostics.push({
        level: 'error',
        message: `Brick "${fileId}" meta is invalid: ${parsed.error}`,
        file,
      });
      continue;
    }
    bricks.push(
      toBrickEntry(fileId, parsed.meta, brickConfig(fileId, file, configSource, diagnostics))
    );
  }
  return bricks;
}

/**
 * Build `bricks[]` entries from `defineBrick` descriptors captured by the
 * collector. The descriptor is react-free, so no Bun.build/import-stub dance is
 * needed: its config zod lowers straight through zodToPreferences. The brick's
 * view must exist at `src/bricks/<id>.tsx`.
 */
async function buildDescriptorBricks(
  pluginRoot: string,
  bricks: readonly CollectedBrick[],
  diagnostics: ValidationDiagnostic[]
): Promise<GeneratedBrick[]> {
  const out: GeneratedBrick[] = [];
  for (const brick of dedupeById(bricks)) {
    const viewPath = join(pluginRoot, 'src', 'bricks', `${brick.id}.tsx`);
    if (!(await Bun.file(viewPath).exists())) {
      diagnostics.push({
        level: 'error',
        message: `Brick "${brick.id}" descriptor has no view at src/bricks/${brick.id}.tsx`,
        file: viewPath,
      });
      continue;
    }
    const { preferences, warnings } = zodToPreferences(brick.config);
    pushZodWarnings(diagnostics, brick.id, warnings, viewPath);
    out.push(toBrickEntry(brick.id, brick.meta, preferences.length > 0 ? preferences : undefined));
  }
  return out;
}

/**
 * Build the `pages[]` entries. A page contributes `{ id, icon? }`; the optional
 * icon comes from an `export const meta = { icon }`. Pages need no other
 * metadata, so a missing `meta` export is fine (not an error).
 */
async function buildPages(
  files: readonly string[],
  diagnostics: ValidationDiagnostic[]
): Promise<GeneratedPage[]> {
  const pages: GeneratedPage[] = [];
  for (const file of files) {
    const id = basename(file, '.tsx');
    const loaded = await readBrowserModule(file);
    if ('error' in loaded) {
      diagnostics.push({
        level: 'error',
        message: `Failed to read page "${id}": ${loaded.error}`,
        file,
      });
      continue;
    }
    if (loaded.ns.meta === undefined) {
      pages.push({ id });
      continue;
    }
    const parsed = parseBrickMeta(loaded.ns.meta);
    if (!parsed.ok) {
      diagnostics.push({
        level: 'error',
        message: `Page "${id}" meta is invalid: ${parsed.error}`,
        file,
      });
      continue;
    }
    pages.push({ id, icon: parsed.meta.icon });
  }
  return pages;
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/**
 * Generate the `blocks[]`, `sparks[]`, `bricks[]`, and `pages[]` manifest arrays
 * from plugin source. Blocks must carry `meta` (the manifest requires a
 * category); a block without `meta` is an error so a capability is never
 * silently dropped. Sparks may omit `meta`; bricks must export `meta`; pages may
 * omit it (only `icon` is optional metadata).
 */
export async function generateManifest(pluginRoot: string): Promise<GeneratedManifest> {
  const root = resolve(pluginRoot);
  const [blocks, sparks, descriptorPaths, legacyBrickPaths, pagePaths] = await Promise.all([
    blockFiles(root),
    sparkFiles(root),
    brickDescriptorFiles(root),
    brickFiles(root),
    pageFiles(root),
  ]);
  const { collected, errors } = await importModules([...blocks, ...sparks, ...descriptorPaths]);
  const diagnostics: ValidationDiagnostic[] = [...errors];

  const managedBlocks: GeneratedBlock[] = [];
  for (const block of dedupeById(collected.blocks)) {
    if (block.meta) {
      managedBlocks.push(await toBlockEntry(root, { ...block, meta: block.meta }));
    } else {
      diagnostics.push({
        level: 'error',
        message: `Block "${block.id}" has no meta() in source; add meta (with a category) so brika build can manage its manifest entry`,
      });
    }
  }

  // Descriptor bricks (defineBrick) win; legacy `.tsx`-export bricks fill in any
  // id without a descriptor (back-compat).
  const descriptorBricks = await buildDescriptorBricks(root, collected.bricks, diagnostics);
  const descriptorIds = new Set(descriptorBricks.map((b) => b.id));
  const legacyBrickFiles = legacyBrickPaths.filter((f) => !descriptorIds.has(basename(f, '.tsx')));
  const legacyBricks = await buildBricks(legacyBrickFiles, diagnostics);

  return {
    blocks: [...managedBlocks].sort(byId),
    sparks: dedupeById(collected.sparks).map(toSparkEntry).sort(byId),
    bricks: [...descriptorBricks, ...legacyBricks].sort(byId),
    pages: (await buildPages(pagePaths, diagnostics)).sort(byId),
    diagnostics,
    ok: diagnostics.every((d) => d.level !== 'error'),
  };
}
