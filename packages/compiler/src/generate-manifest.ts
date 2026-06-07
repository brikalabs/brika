/**
 * Manifest generation for `brika build`.
 *
 * Blocks, sparks, and react-free `*.brick.ts` descriptors are server modules:
 * importing them runs their `define*` calls under an installed collector. Bricks
 * can also live in a single `*.tsx` that exports both a `defineBrick` descriptor
 * and the default view, or (legacy) co-locate plain `meta`/`config` exports;
 * both are read via a `Bun.build` pass that stubs react and keeps `@brika/sdk`
 * external. A single-file `.tsx` brick is only safe when no server module
 * imports its descriptor (otherwise react leaks into the plugin subprocess), so
 * bricks that push data keep the descriptor in a `*.brick.ts`. All are lowered
 * into the `blocks[]` / `sparks[]` / `bricks[]` / `pages[]` shapes the hub reads
 * from `package.json`. The hub contract is unchanged: this only generates the
 * committed arrays.
 */

import { rm } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type BrickMetaInput,
  type CollectedBlock,
  type CollectedBrick,
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
      // Skip `_` helpers and test files; neither is a capability or entry import.
      if (!(base.startsWith('_') || base.includes('.test.') || base.includes('.spec.'))) {
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

/** Brick descriptors are react-free modules at `src/bricks/<id>.brick.ts`. */
function brickDescriptorFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/bricks/*.brick.ts');
}

/** Legacy brick views with co-located meta/config exports at `src/bricks/<id>.tsx`. */
function brickFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/bricks/*.tsx');
}

/** Server-side action modules: `src/actions.ts` and/or `src/actions/*.ts`. */
async function actionFiles(pluginRoot: string): Promise<string[]> {
  const [single, dir] = await Promise.all([
    scanGlob(pluginRoot, 'src/actions.ts'),
    scanGlob(pluginRoot, 'src/actions/*.ts'),
  ]);
  return Array.from(new Set([...single, ...dir]));
}

/** Return the first of `candidates` (paths relative to root) that exists. */
async function firstExisting(root: string, candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    const path = join(root, candidate);
    if (await Bun.file(path).exists()) {
      return path;
    }
  }
  return undefined;
}

/** A bare, extensionless ESM specifier from `fromDir` to `file`. */
function toSpecifier(fromDir: string, file: string): string {
  const rel = relative(fromDir, file)
    .replaceAll('\\', '/')
    .replace(/\.tsx?$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

const ENTRY_HEADER = `// Generated by \`brika build\`. Do not edit.
// package.json "main" points here; importing each module runs its define*()
// registration (blocks, sparks, actions) and the plugin lifecycle.`;

/**
 * Generate the committed `src/_generated/entry.ts` content: side-effect imports
 * of every server module (blocks, sparks, actions) plus the optional lifecycle
 * file `src/plugin.ts`, replacing the hand-maintained `src/index.tsx` barrel.
 * Browser modules (bricks/pages) are never imported here: they would pull React
 * into the isolated plugin subprocess.
 */
export async function generateEntry(pluginRoot: string): Promise<string> {
  const root = resolve(pluginRoot);
  const entryDir = join(root, 'src', '_generated');
  const [blocks, sparks, actions] = await Promise.all([
    blockFiles(root),
    sparkFiles(root),
    actionFiles(root),
  ]);
  const lifecycle = await firstExisting(root, ['src/plugin.ts', 'src/plugin.tsx']);

  const specifiers = [...blocks, ...sparks, ...actions]
    .sort((a, b) => a.localeCompare(b))
    .map((file) => toSpecifier(entryDir, file));
  if (lifecycle !== undefined) {
    specifiers.push(toSpecifier(entryDir, lifecycle));
  }

  const lines = specifiers.map((specifier) => `import '${specifier}';`);
  return `${ENTRY_HEADER}\n${lines.join('\n')}\n`;
}

/** Pages are browser modules at `src/pages/<id>.tsx`. */
function pageFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/pages/*.tsx');
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

const browserBuildPlugin: BunPlugin = {
  name: 'brika-browser-extract',
  setup(build) {
    // react is referenced only inside the unrun view; stub it and its runtimes.
    build.onResolve({ filter: /^react(-dom)?($|\/)/ }, (args) => ({
      path: args.path,
      namespace: 'brika-react-stub',
    }));
    // @brika/sdk/ui-kit (components + hooks + icons) pulls react, so stub it.
    // Must precede the general @brika/sdk rule below.
    build.onResolve({ filter: /^@brika\/sdk\/ui-kit(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: 'brika-proxy-stub',
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
    // Everything else under @brika/sdk is import-safe; keep it external so its
    // `z` is the same instance zodToPreferences uses (cross-instance is unsafe).
    build.onResolve({ filter: /^@brika\/sdk(\/.*)?$/ }, (args) => ({
      path: args.path,
      external: true,
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
 * Bundle a browser module (brick or page) with react/ui stubbed and @brika/sdk
 * external, import the result, and return its exports. The temp file is written
 * beside the source so its `@brika/sdk` import resolves exactly as it would.
 */
async function readBrowserModule(
  file: string
): Promise<{ ns: Record<string, unknown> } | { error: string }> {
  let built: Awaited<ReturnType<typeof Bun.build>>;
  try {
    built = await Bun.build({
      entrypoints: [file],
      target: 'bun',
      plugins: [browserBuildPlugin],
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

/** A `defineBrick` descriptor surfaced as a module export of a single-file brick. */
interface ExportedBrickDescriptor {
  id: string;
  meta: unknown;
  config: unknown;
}

/**
 * Find a `defineBrick` descriptor among a `.tsx` module's exports (the named
 * export beside the default view in a single-file brick). Identified by shape:
 * a string `id`, a `meta` object, a zod `config`, and a `data` channel with
 * `set`/`use`. Returns the first match, or undefined for a legacy view.
 */
function findBrickDescriptor(ns: Record<string, unknown>): ExportedBrickDescriptor | undefined {
  for (const value of Object.values(ns)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const candidate = value as Record<string, unknown>;
    const data = candidate.data;
    const isDescriptor =
      typeof candidate.id === 'string' &&
      typeof candidate.meta === 'object' &&
      candidate.meta !== null &&
      isZodSchema(candidate.config) &&
      typeof data === 'object' &&
      data !== null &&
      typeof (data as Record<string, unknown>).set === 'function' &&
      typeof (data as Record<string, unknown>).use === 'function';
    if (isDescriptor) {
      return { id: candidate.id as string, meta: candidate.meta, config: candidate.config };
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
    for (const warning of warnings) {
      diagnostics.push({
        level: 'warning',
        message: `Brick "${brick.id}": ${warning}`,
        file: viewPath,
      });
    }
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

  const generatedSparks = dedupeById(collected.sparks).map(toSparkEntry).sort(byId);

  // Descriptor bricks (defineBrick) win; legacy `.tsx`-export bricks fill in any
  // id without a descriptor (back-compat).
  const descriptorBricks = await buildDescriptorBricks(root, collected.bricks, diagnostics);
  const descriptorIds = new Set(descriptorBricks.map((b) => b.id));
  const legacyBrickFiles = legacyBrickPaths.filter((f) => !descriptorIds.has(basename(f, '.tsx')));
  const legacyBricks = await buildBricks(legacyBrickFiles, diagnostics);
  const generatedBricks = [...descriptorBricks, ...legacyBricks].sort(byId);
  const generatedPages = (await buildPages(pagePaths, diagnostics)).sort(byId);

  return {
    blocks: managedBlocks.sort(byId),
    sparks: generatedSparks,
    pages: generatedPages,
    bricks: generatedBricks,
    diagnostics,
    ok: diagnostics.every((d) => d.level !== 'error'),
  };
}
