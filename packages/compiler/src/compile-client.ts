import { basename } from 'node:path';
import type { BuildOutput, BunPlugin } from 'bun';
import {
  type BundleChunk,
  type BundleEntry,
  CHUNK_PREFIX,
  type RawBundleResult,
} from './bundle/types';
import { brikaActionsPlugin } from './plugins/actions-client';
import { brikaExternalsPlugin } from './plugins/externals';
import { brikaForceSideEffectsPlugin } from './plugins/force-side-effects';
import { brikaI18nCallSitePlugin } from './plugins/i18n-call-site';

export interface ClientCompileOptions {
  /** Absolute path to .tsx entrypoint */
  entrypoint: string;
  /** Absolute path to plugin root (for relative path computation in action hashes) */
  pluginRoot: string;
  /**
   * Base directory paths in injected `t()` call-site metadata are relative
   * to. Defaults to `pluginRoot`. Pass the workspace root so the resulting
   * `plugins/<pkg>/src/...` paths are resolvable by a dev server that does
   * not know about a specific plugin's layout.
   */
  sourceRoot?: string;
  /** Additional Bun plugins to inject (optional) */
  extraPlugins?: BunPlugin[];
}

export type ClientCompileResult =
  | { success: true; js: string }
  | { success: false; errors: string[] };

/** The build inputs both client compile paths share, independent of entrypoints. */
interface ClientPluginOptions {
  /** Absolute path to plugin root (for relative path computation in action hashes). */
  pluginRoot: string;
  /** Base directory for injected `t()` call-site metadata. Defaults to `pluginRoot`. */
  sourceRoot?: string;
  /** Additional Bun plugins to inject (optional). */
  extraPlugins?: BunPlugin[];
}

/** Shared `Bun.build` plugin chain for every client (browser) build. */
function clientPlugins(opts: ClientPluginOptions): BunPlugin[] {
  const plugins: BunPlugin[] = [
    brikaExternalsPlugin(),
    brikaActionsPlugin(opts.pluginRoot),
    // Keep barrel re-exports from being dead-code-eliminated. Bun still drops a
    // re-exported implementation (e.g. recharts' getNiceTickValues) from a
    // `sideEffects: false` package when the barrel lands in a SPLIT chunk, even
    // on 1.3.14, leaving the call site referencing an undefined symbol at
    // runtime. This is load-bearing for any chart brick; do not remove without
    // rendering a recharts chart from a split build (see force-side-effects.ts).
    brikaForceSideEffectsPlugin(),
    // Inject `{ __cs: 'file:line' }` into `t('...')` calls so the i18n
    // devtools overlay can recover the source location at runtime: the
    // bundled output otherwise reports a single minified line.
    brikaI18nCallSitePlugin(opts.sourceRoot ?? opts.pluginRoot),
  ];
  if (opts.extraPlugins) {
    plugins.push(...opts.extraPlugins);
  }
  return plugins;
}

/** Options common to every client `Bun.build` (single module or bundle). */
const clientBuildBase = {
  target: 'browser',
  format: 'esm',
  minify: true,
  // Inline NODE_ENV as 'production' so libraries gated on
  // `process.env.NODE_ENV !== 'production'` (recharts, React-style code)
  // drop their dev-only branches. Bun otherwise leaves the value as
  // 'development' for the browser target, shipping dev warnings.
  define: { 'process.env.NODE_ENV': '"production"' },
  // Return a failed result with logs instead of throwing an opaque
  // AggregateError, so callers can surface the actual build errors.
  throw: false,
} as const;

/** The failed-build error messages, one per Bun log entry. */
const buildErrors = (result: BuildOutput): string[] => result.logs.map((l) => l.message);

/**
 * Compile a single client-side module (page or brick) for the browser.
 * Returns the bundled JS string on success.
 *
 * Deliberately NOT expressed via {@link compileClientBundle}: this path builds
 * without code splitting so the output is one self-contained file, which is
 * what the hub's standalone fallback serves when a kind build fails.
 *
 * Action files are detected automatically via `Bun.Transpiler.scan()`
 * (no pre-scanning needed). Files importing `@brika/sdk/actions` are
 * replaced with `{ __actionId }` stubs.
 */
export async function compileClientModule(
  opts: ClientCompileOptions
): Promise<ClientCompileResult> {
  const result = await Bun.build({
    entrypoints: [opts.entrypoint],
    plugins: clientPlugins(opts),
    ...clientBuildBase,
  });

  if (!result.success) {
    return { success: false, errors: buildErrors(result) };
  }

  const [output] = result.outputs;
  if (!output) {
    return {
      success: false,
      errors: ['Build succeeded but produced no output'],
    };
  }

  return {
    success: true,
    js: await output.text(),
  };
}

export interface ClientBundleOptions {
  /** Absolute paths to the `.tsx` entrypoints to build together. */
  entrypoints: string[];
  /** Absolute path to plugin root (for relative path computation in action hashes). */
  pluginRoot: string;
  /** Base directory for injected `t()` call-site metadata. See {@link ClientCompileOptions}. */
  sourceRoot?: string;
  /** Additional Bun plugins to inject (optional). */
  extraPlugins?: BunPlugin[];
}

/** An entrypoint's output name: its basename without the source extension. */
const outputName = (abs: string): string => basename(abs).replace(/\.[tj]sx?$/, '');

/**
 * Split entrypoints into batches with no repeated output name inside a batch.
 * Bun names entry outputs `[name].js` from the source basename (the output
 * layout must stay flat so entries import chunks as `./_brika_chunk_<hash>.js`),
 * so two same-named entrypoints across kinds (`bricks/devices.tsx` +
 * `pages/devices.tsx`) are ambiguous within one build: batching restores an
 * unambiguous output -> entrypoint mapping. Almost every call yields a single
 * batch; a collision costs one extra build (and possibly a duplicated chunk),
 * never a wrong mapping.
 */
function batchByName(entrypoints: string[]): string[][] {
  const batches: string[][] = [];
  const seen = new Map<string, number>();
  for (const abs of entrypoints) {
    const name = outputName(abs);
    const batch = seen.get(name) ?? 0;
    seen.set(name, batch + 1);
    (batches[batch] ??= []).push(abs);
  }
  return batches;
}

/** One `Bun.build` over a batch of unique-named entrypoints, outputs mapped back. */
async function buildBatch(
  entrypoints: string[],
  opts: ClientBundleOptions
): Promise<RawBundleResult> {
  const result = await Bun.build({
    entrypoints,
    plugins: clientPlugins(opts),
    splitting: true,
    naming: { entry: '[name].[ext]', chunk: `${CHUNK_PREFIX}[hash].[ext]` },
    ...clientBuildBase,
  });

  if (!result.success) {
    return { success: false, errors: buildErrors(result) };
  }

  const byName = new Map(entrypoints.map((abs) => [outputName(abs), abs]));
  const entries: BundleEntry[] = [];
  const chunks: BundleChunk[] = [];
  const errors: string[] = [];

  for (const output of result.outputs) {
    const name = basename(output.path).replace(/\.js$/, '');
    if (output.kind === 'entry-point') {
      const entrypoint = byName.get(name);
      if (!entrypoint) {
        errors.push(`Could not map build output "${output.path}" back to an entrypoint`);
        continue;
      }
      entries.push({ entrypoint, js: await output.text() });
    } else if (output.kind === 'chunk') {
      chunks.push({ name, js: await output.text() });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, entries, chunks };
}

/**
 * Compile several client modules together with code splitting so shared
 * dependencies (e.g. recharts pulled in by multiple bricks) land in a single
 * chunk instead of being duplicated into every entry's bundle.
 *
 * Entry outputs are named `[name].js` (the source basename) so each maps back
 * to its entrypoint; chunks are named `_brika_chunk_[hash].js`. The host serves
 * both from `/api/modules`, and each entry references its chunks via a relative
 * `import './_brika_chunk_<hash>.js'` that resolves against the entry's URL.
 */
export async function compileClientBundle(opts: ClientBundleOptions): Promise<RawBundleResult> {
  if (opts.entrypoints.length === 0) {
    return { success: true, entries: [], chunks: [] };
  }

  const entries: BundleEntry[] = [];
  const chunkByName = new Map<string, BundleChunk>();
  for (const batch of batchByName(opts.entrypoints)) {
    const result = await buildBatch(batch, opts);
    if (!result.success) {
      return result;
    }
    entries.push(...result.entries);
    // Chunk names are content hashes: a repeat across batches is the same code.
    for (const chunk of result.chunks) {
      if (!chunkByName.has(chunk.name)) {
        chunkByName.set(chunk.name, chunk);
      }
    }
  }
  return { success: true, entries, chunks: [...chunkByName.values()] };
}
