/**
 * Manifest generation for `brika build`.
 *
 * Imports a plugin's block and spark modules so their `defineReactiveBlock` /
 * `defineSpark` calls run under an installed collector, then lowers the
 * captured metadata into the `blocks[]` / `sparks[]` shapes the hub reads
 * from `package.json`. The hub contract is unchanged: this only generates the
 * arrays that are committed back to `package.json`.
 */

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type CollectedBlock,
  type CollectedManifest,
  type CollectedSpark,
  drainCollector,
  installCollector,
} from '@brika/sdk/collect';
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

export interface GeneratedManifest {
  blocks: GeneratedBlock[];
  sparks: GeneratedSpark[];
  diagnostics: ValidationDiagnostic[];
  /** False when any diagnostic is an error. */
  ok: boolean;
}

/** Bumped per dynamic import so repeated builds in one process re-run modules. */
let importSalt = 0;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Collect file paths matching a glob under the plugin root, skipping `_` helpers. */
async function scanGlob(pluginRoot: string, pattern: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const glob = new Bun.Glob(pattern);
    for await (const rel of glob.scan({ cwd: pluginRoot })) {
      const base = rel.split('/').pop() ?? rel;
      if (!base.startsWith('_')) {
        out.push(join(pluginRoot, rel));
      }
    }
  } catch {
    // Directory may not exist; treat as no matches.
  }
  return out;
}

/** Block logic lives in `src/blocks/*.ts`; `*.view.tsx` / `*.node.tsx` are views. */
function blockFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/blocks/*.ts');
}

/** Sparks may be a single `src/sparks.ts` or a `src/sparks/` directory. */
async function sparkFiles(pluginRoot: string): Promise<string[]> {
  const [single, dir] = await Promise.all([
    scanGlob(pluginRoot, 'src/sparks.ts'),
    scanGlob(pluginRoot, 'src/sparks/*.ts'),
  ]);
  return Array.from(new Set([...single, ...dir]));
}

interface ImportResult {
  collected: CollectedManifest;
  errors: ValidationDiagnostic[];
}

/** Import each module under an installed collector and return what it captured. */
async function importModules(files: readonly string[]): Promise<ImportResult> {
  const errors: ValidationDiagnostic[] = [];
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
  return {
    id,
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    ...(meta.description !== undefined ? { description: meta.description } : {}),
    category: meta.category,
    ...(meta.icon !== undefined ? { icon: meta.icon } : {}),
    ...(meta.color !== undefined ? { color: meta.color } : {}),
    ...(hasView ? { view: true } : {}),
    ...(hasNode ? { nodeView: true } : {}),
  };
}

function toSparkEntry(spark: CollectedSpark): GeneratedSpark {
  const { id, meta } = spark;
  return {
    id,
    ...(meta?.name !== undefined ? { name: meta.name } : {}),
    ...(meta?.description !== undefined ? { description: meta.description } : {}),
  };
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/**
 * Generate the `blocks[]` and `sparks[]` manifest arrays from plugin source.
 *
 * A block must carry `meta` (its `category` is required by the manifest); a
 * block without `meta` produces an error diagnostic so `brika build` refuses
 * rather than silently dropping a capability. Sparks may omit `meta`.
 */
export async function generateManifest(pluginRoot: string): Promise<GeneratedManifest> {
  const [blocks, sparks] = await Promise.all([blockFiles(pluginRoot), sparkFiles(pluginRoot)]);
  const { collected, errors } = await importModules([...blocks, ...sparks]);
  const diagnostics: ValidationDiagnostic[] = [...errors];

  const managedBlocks: GeneratedBlock[] = [];
  for (const block of dedupeById(collected.blocks)) {
    if (block.meta) {
      managedBlocks.push(await toBlockEntry(pluginRoot, { ...block, meta: block.meta }));
    } else {
      diagnostics.push({
        level: 'error',
        message: `Block "${block.id}" has no meta() in source; add meta (with a category) so brika build can manage its manifest entry`,
      });
    }
  }

  const generatedSparks = dedupeById(collected.sparks).map(toSparkEntry).sort(byId);

  return {
    blocks: managedBlocks.sort(byId),
    sparks: generatedSparks,
    diagnostics,
    ok: diagnostics.every((d) => d.level !== 'error'),
  };
}
