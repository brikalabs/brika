import { basename } from 'node:path';
import type { BunPlugin } from 'bun';
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

/**
 * Filename prefix Bun gives every shared chunk a client bundle emits.
 *
 * Picked to be distinctive so it cannot collide with a plugin's own module ids
 * (brick/page/block ids never start with `_`). An entry references a chunk via
 * a relative `import './<prefix><hash>.js'`, so the hub serves chunks from the
 * same `/api/modules` route, special-casing any file whose id has this prefix.
 */
export const CLIENT_CHUNK_PREFIX = '_brika_chunk_';

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

/**
 * Compile a single client-side module (page or brick) for the browser.
 * Returns the bundled JS string on success.
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
    return {
      success: false,
      errors: result.logs.map((l) => l.message),
    };
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

/** One compiled entry point of a bundle, mapped back to its source entrypoint. */
export interface ClientBundleEntry {
  /** Absolute path of the source `.tsx` entrypoint this output came from. */
  entrypoint: string;
  /** The entry's bundled JS (imports any shared chunks by relative path). */
  js: string;
}

/** One shared code chunk extracted across the bundle's entrypoints. */
export interface ClientBundleChunk {
  /** Chunk filename without extension, e.g. `_brika_chunk_54bngp5g`. */
  name: string;
  /** The chunk's bundled JS. */
  js: string;
}

export type ClientBundleResult =
  | { success: true; entries: ClientBundleEntry[]; chunks: ClientBundleChunk[] }
  | { success: false; errors: string[] };

/** Map an entrypoint's basename (no extension) back to its absolute path. */
function entrypointByName(entrypoints: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const abs of entrypoints) {
    map.set(basename(abs).replace(/\.[tj]sx?$/, ''), abs);
  }
  return map;
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
export async function compileClientBundle(opts: ClientBundleOptions): Promise<ClientBundleResult> {
  if (opts.entrypoints.length === 0) {
    return { success: true, entries: [], chunks: [] };
  }

  const result = await Bun.build({
    entrypoints: opts.entrypoints,
    plugins: clientPlugins(opts),
    splitting: true,
    naming: { entry: '[name].[ext]', chunk: `${CLIENT_CHUNK_PREFIX}[hash].[ext]` },
    ...clientBuildBase,
  });

  if (!result.success) {
    return { success: false, errors: result.logs.map((l) => l.message) };
  }

  const byName = entrypointByName(opts.entrypoints);
  const entries: ClientBundleEntry[] = [];
  const chunks: ClientBundleChunk[] = [];
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
