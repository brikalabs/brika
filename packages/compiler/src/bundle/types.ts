/**
 * Runtime-agnostic bundler port. One interface, two adapters: `BunBundler`
 * (native `Bun.build`) and `IsolateBundler` (rollup + sucrase, runs in a V8
 * isolate / Cloudflare Worker). Each composition root binds its adapter
 * explicitly: the hub's ModuleCompiler uses `BunBundler`, the Worker gate uses
 * `IsolateBundler` (via `@brika/compiler/v8`).
 */

/** Which backend produced an artifact. Stamped into every output. */
export type Backend = 'bun' | 'isolate';

/**
 * Filename prefix every shared chunk is emitted under, on BOTH backends.
 *
 * Picked to be distinctive so it cannot collide with a plugin's own module ids
 * (brick/page/block ids never start with `_`). An entry references a chunk via
 * a relative `import './<prefix><hash>.js'`, so the hub serves chunks from the
 * same `/api/modules` route, special-casing any file whose id has this prefix.
 */
export const CHUNK_PREFIX = '_brika_chunk_';

export interface BundleOptions {
  /** Absolute paths to the `.tsx`/`.ts` entrypoints to build together. */
  readonly entrypoints: string[];
  /** Absolute plugin root, for relative-path computation in action hashes. */
  readonly pluginRoot: string;
  /** Base dir for injected i18n call-site metadata. Defaults to `pluginRoot`. */
  readonly sourceRoot?: string;
  /**
   * Read a source file. Defaults to `node:fs` (Bun/Node). In a Worker, pass a
   * reader backed by the plugin tarball so no filesystem is touched. Only the
   * isolate adapter consults this; `Bun.build` reads the disk itself.
   */
  readonly readFile?: (absPath: string) => Promise<string> | string;
}

/** One compiled entrypoint, mapped back to its source. */
export interface BundleEntry {
  /** Absolute path of the source entrypoint this output came from. */
  readonly entrypoint: string;
  /** The entry's bundled JS (imports any shared chunks by relative path). */
  readonly js: string;
}

/** One shared code chunk extracted across the bundle's entrypoints. */
export interface BundleChunk {
  /** Chunk filename without extension, e.g. `_brika_chunk_54bngp5g`. */
  readonly name: string;
  readonly js: string;
}

/**
 * A build product before provenance stamping: what the raw compile pipelines
 * (`compileClientBundle`) return. A `Bundler` adapter turns this into a
 * {@link BundleResult} by stamping backend + version onto every output.
 */
export type RawBundleResult =
  | { readonly success: true; readonly entries: BundleEntry[]; readonly chunks: BundleChunk[] }
  | { readonly success: false; readonly errors: string[] };

export type BundleResult =
  | {
      readonly success: true;
      readonly backend: Backend;
      /** Compiler fingerprint, stamped into every emitted file. */
      readonly version: string;
      readonly entries: BundleEntry[];
      readonly chunks: BundleChunk[];
    }
  | { readonly success: false; readonly backend: Backend; readonly errors: string[] };

/** A bundler backed by one runtime. Swap the implementation, keep the caller. */
export interface Bundler {
  readonly backend: Backend;
  /** This bundler's fingerprint, matching the stamp it writes. For cache keys. */
  readonly version: string;
  bundle(opts: BundleOptions): Promise<BundleResult>;
}
