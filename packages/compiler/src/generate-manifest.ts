/**
 * Manifest generation for `brika build`.
 *
 * Blocks and sparks are server modules: importing them runs their
 * `defineReactiveBlock` / `defineSpark` calls under an installed collector.
 * Bricks are browser modules (JSX + `react`, which plugins do not depend on),
 * so each is bundled with `Bun.build` first, stubbing `react` and keeping
 * `@brika/sdk` external (so its `z` is the same instance this module uses),
 * then imported to read its `meta` + `config` exports without rendering. All
 * three are lowered into the `blocks[]` / `sparks[]` / `bricks[]` shapes the hub
 * reads from `package.json`. The hub contract is unchanged: this only generates
 * the arrays that are committed back to `package.json`.
 */

import { rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type BrickMetaInput,
  type CollectedBlock,
  type CollectedManifest,
  type CollectedSpark,
  drainCollector,
  installCollector,
  isZodSchema,
  type PreferenceEntry,
  parseBrickMeta,
  zodToPreferences,
} from '@brika/sdk/collect';
import type { BunPlugin } from 'bun';
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

export interface GeneratedManifest {
  blocks: GeneratedBlock[];
  sparks: GeneratedSpark[];
  bricks: GeneratedBrick[];
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

/** Bricks are browser modules at `src/bricks/<id>.tsx`. */
function brickFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/bricks/*.tsx');
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

function toBrickEntry(
  id: string,
  meta: BrickMetaInput,
  config: PreferenceEntry[] | undefined
): GeneratedBrick {
  return {
    id,
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    ...(meta.description !== undefined ? { description: meta.description } : {}),
    ...(meta.category !== undefined ? { category: meta.category } : {}),
    ...(meta.icon !== undefined ? { icon: meta.icon } : {}),
    ...(meta.color !== undefined ? { color: meta.color } : {}),
    ...(meta.families !== undefined ? { families: meta.families } : {}),
    ...(config !== undefined ? { config } : {}),
  };
}

// Stand-in for `react` and its JSX runtimes. Plugins do not depend on react;
// the host provides it at runtime. Every binding a brick imports must exist as
// a name here, but none is ever called (the component is never rendered).
const REACT_STUB = `
const noop = () => {};
export const useState = (v) => [typeof v === 'function' ? v() : v, noop];
export const useEffect = noop;
export const useLayoutEffect = noop;
export const useMemo = (fn) => (typeof fn === 'function' ? fn() : undefined);
export const useCallback = (fn) => fn;
export const useRef = (v) => ({ current: v === undefined ? null : v });
export const useContext = () => undefined;
export const useReducer = (_r, init) => [init, noop];
export const useId = () => 'brika-id';
export const useImperativeHandle = noop;
export const useSyncExternalStore = () => undefined;
export const createElement = noop;
export const cloneElement = noop;
export const createContext = () => ({ Provider: noop, Consumer: noop });
export const forwardRef = (fn) => fn;
export const memo = (fn) => fn;
export const Fragment = 'fragment';
export const StrictMode = 'strict-mode';
export const jsx = noop;
export const jsxs = noop;
export const jsxDEV = noop;
export default { createElement, Fragment };
`;

// Stand-in for lucide-react: icon names cannot be enumerated, so a CJS Proxy
// satisfies any named import. Icons are only referenced inside the unrun view,
// so resolving to undefined is fine.
const PROXY_STUB = 'const fn = () => undefined; module.exports = new Proxy(fn, { get: () => fn });';

// Stand-in for clsx / class-variance-authority. Unlike icons, these can be
// CALLED at module top level (e.g. `const v = cva(...)`), so they must be real
// callables that return callables, with their exports named explicitly.
const UTIL_STUB = `
const cx = () => '';
const cva = () => () => '';
export default cx;
export { cx, cva };
export const clsx = cx;
export const cn = cx;
export const compose = cva;
export const twMerge = cx;
`;

const brickBuildPlugin: BunPlugin = {
  name: 'brika-brick-extract',
  setup(build) {
    // Keep @brika/sdk external so the brick's `z` is the same instance this
    // module's zodToPreferences uses (cross-instance toJSONSchema is unsafe).
    build.onResolve({ filter: /^@brika\/sdk(\/.*)?$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
    // react is referenced only inside the unrun view; stub it and its runtimes.
    build.onResolve({ filter: /^react(-dom)?($|\/)/ }, (args) => ({
      path: args.path,
      namespace: 'brika-react-stub',
    }));
    // lucide-react: arbitrary icon names, referenced only inside the view.
    build.onResolve({ filter: /^lucide-react$/ }, (args) => ({
      path: args.path,
      namespace: 'brika-proxy-stub',
    }));
    // clsx / cva: may be called at module top level, so need real callables.
    build.onResolve({ filter: /^(clsx|class-variance-authority)$/ }, (args) => ({
      path: args.path,
      namespace: 'brika-util-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'brika-react-stub' }, () => ({
      loader: 'js',
      contents: REACT_STUB,
    }));
    build.onLoad({ filter: /.*/, namespace: 'brika-proxy-stub' }, () => ({
      loader: 'js',
      contents: PROXY_STUB,
    }));
    build.onLoad({ filter: /.*/, namespace: 'brika-util-stub' }, () => ({
      loader: 'js',
      contents: UTIL_STUB,
    }));
  },
};

/**
 * Bundle a brick (react stubbed, @brika/sdk external), import the result, and
 * read its `meta` + `config` exports. The temp file is written beside the brick
 * so its `@brika/sdk` import resolves exactly as the brick's would.
 */
async function readBrickModule(
  file: string
): Promise<{ ns: Record<string, unknown> } | { error: string }> {
  let built: Awaited<ReturnType<typeof Bun.build>>;
  try {
    built = await Bun.build({
      entrypoints: [file],
      target: 'bun',
      plugins: [brickBuildPlugin],
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  if (!built.success) {
    return { error: built.logs.map((l) => l.message).join('; ') };
  }
  const [output] = built.outputs;
  if (!output) {
    return { error: 'bundling produced no output' };
  }
  importSalt += 1;
  const tmp = join(dirname(file), `.brika-manifest.${basename(file, '.tsx')}.${importSalt}.mjs`);
  try {
    await Bun.write(tmp, await output.text());
    const ns: Record<string, unknown> = await import(pathToFileURL(tmp).href);
    return { ns };
  } catch (err) {
    return { error: errorMessage(err) };
  } finally {
    await rm(tmp, { force: true });
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
  for (const warning of warnings) {
    diagnostics.push({ level: 'warning', message: `Brick "${id}": ${warning}`, file });
  }
  return preferences.length > 0 ? preferences : undefined;
}

/**
 * Build the `bricks[]` entries by reading each brick's `meta` (required) and
 * `config` (optional zod) exports. A brick without `meta` is an error so
 * `brika build` refuses rather than silently dropping it.
 */
async function buildBricks(
  files: readonly string[],
  diagnostics: ValidationDiagnostic[]
): Promise<GeneratedBrick[]> {
  const bricks: GeneratedBrick[] = [];
  for (const file of files) {
    const id = basename(file, '.tsx');
    const loaded = await readBrickModule(file);
    if ('error' in loaded) {
      diagnostics.push({
        level: 'error',
        message: `Failed to read brick "${id}": ${loaded.error}`,
        file,
      });
      continue;
    }
    const { ns } = loaded;
    if (ns.meta === undefined) {
      diagnostics.push({
        level: 'error',
        message: `Brick "${id}" has no meta export; add \`export const meta = { ... }\` so brika build can manage its manifest entry`,
        file,
      });
      continue;
    }
    const parsed = parseBrickMeta(ns.meta);
    if (!parsed.ok) {
      diagnostics.push({
        level: 'error',
        message: `Brick "${id}" meta is invalid: ${parsed.error}`,
        file,
      });
      continue;
    }
    bricks.push(toBrickEntry(id, parsed.meta, brickConfig(id, file, ns.config, diagnostics)));
  }
  return bricks;
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/**
 * Generate the `blocks[]`, `sparks[]`, and `bricks[]` manifest arrays from
 * plugin source. Blocks must carry `meta` (the manifest requires a category);
 * a block without `meta` is an error so a capability is never silently dropped.
 * Sparks may omit `meta`; bricks must export `meta`.
 */
export async function generateManifest(pluginRoot: string): Promise<GeneratedManifest> {
  const root = resolve(pluginRoot);
  const [blocks, sparks, brickPaths] = await Promise.all([
    blockFiles(root),
    sparkFiles(root),
    brickFiles(root),
  ]);
  const { collected, errors } = await importModules([...blocks, ...sparks]);
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

  const generatedSparks = dedupeById(collected.sparks).map(toSparkEntry).sort(byId);
  const generatedBricks = (await buildBricks(brickPaths, diagnostics)).sort(byId);

  return {
    blocks: managedBlocks.sort(byId),
    sparks: generatedSparks,
    bricks: generatedBricks,
    diagnostics,
    ok: diagnostics.every((d) => d.level !== 'error'),
  };
}
