/**
 * The publish-time compile GATE: pure JS (rollup + sucrase), so it runs
 * identically under Bun and in a V8 isolate / Cloudflare Worker. Published as
 * two build targets with the SAME api - `@brika/compiler/bun` and
 * `@brika/compiler/v8` - so a consumer picks its runtime and calls the same
 * `compilePluginGate`.
 *
 * Free of the Bun `output-version` macro and `Bun.build`, so wrangler/esbuild
 * can bundle it. registry.brika.dev calls this at `/-/publish` (see the store
 * repo's `manifest-validator.ts`): it untars the uploaded plugin, hands the
 * sources here, REJECTS the publish when the plugin does not compile, and
 * persists the returned report (`{ manifest, actions }`) on the version.
 */
import { IsolateBundler } from './isolate';
import type { PluginReport } from './report';
import { buildReport } from './report';
import type { BundleChunk, BundleEntry } from './types';

/** Virtual root the in-memory sources mount under (there is no real filesystem). */
const VROOT = '/plugin';

/**
 * The compiler fingerprint, baked into the published `dist/v8` build: `build.ts`
 * resolves the `output-version` macro and injects it here via `Bun.build`'s
 * `define`. Falls back to `dev` when the gate source is bundled directly (the
 * `cf-test` harness). `GateOptions.version` overrides it.
 */
const BAKED_VERSION = process.env.BRIKA_GATE_VERSION ?? 'dev';

export interface GateOptions {
  /** Plugin sources, keyed by path relative to the plugin root (`src/bricks/current.tsx`). */
  readonly sources: ReadonlyMap<string, string>;
  /** Entry modules to compile, relative paths (`src/bricks/current.tsx`). */
  readonly entrypoints: readonly string[];
  /** Override the stamped fingerprint. Defaults to the one baked into `dist/v8`. */
  readonly version?: string;
  /**
   * Structured log sink. Dependency-free so `@brika/compiler` stays runtime
   * agnostic: a Worker passes `(e, m) => console.log(e, m)` (surfaced by
   * `wrangler tail` / Cloudflare logs); the hub passes its own logger. Emits
   * `gate:start`, `gate:accept`, `gate:reject`.
   */
  readonly log?: (event: string, meta?: Record<string, unknown>) => void;
}

export type GateResult =
  | {
      readonly ok: true;
      readonly entries: BundleEntry[];
      readonly chunks: BundleChunk[];
      /** Capabilities (from package.json) + server actions discovered while compiling. */
      readonly report: PluginReport;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Compile a plugin's browser modules from an in-memory source map. Returns
 * `ok: false` with a reason when it does not compile, so the caller can reject
 * the publish rather than store a fake or broken plugin. Never throws for a
 * broken plugin (that is a normal rejection); only a programmer error would.
 */
export async function compilePluginGate(opts: GateOptions): Promise<GateResult> {
  const log = opts.log ?? (() => undefined);
  const start = performance.now();
  log('gate:start', { entrypoints: opts.entrypoints.length, files: opts.sources.size });

  // Map absolute virtual paths back to the source map; a miss throws, which the
  // bundler's reader treats as "does not exist" (so extension probing works).
  const readFile = (abs: string): string => {
    const rel = abs.startsWith(`${VROOT}/`) ? abs.slice(VROOT.length + 1) : abs;
    const src = opts.sources.get(rel);
    if (src === undefined) {
      throw new Error(`source not found: ${rel}`);
    }
    return src;
  };

  const result = await new IsolateBundler(opts.version ?? BAKED_VERSION).bundle({
    entrypoints: opts.entrypoints.map((e) => `${VROOT}/${e}`),
    pluginRoot: VROOT,
    sourceRoot: VROOT,
    readFile,
  });

  const ms = Math.round(performance.now() - start);
  if (result.success) {
    const report = await buildReport(opts.sources);
    log('gate:accept', {
      entries: result.entries.length,
      chunks: result.chunks.length,
      actions: report.actions.length,
      ms,
    });
    return { ok: true, entries: result.entries, chunks: result.chunks, report };
  }
  const error = result.errors.join('; ');
  log('gate:reject', { error, ms });
  return { ok: false, error };
}

export type { ActionEntry, PluginManifest, PluginReport } from './report';
// The route's public surface is the gate + its result types (below), the report
// helpers, and stamp helpers. IsolateBundler stays internal plumbing.
export { buildReport, readManifest, scanActions } from './report';
export { readStamp, stamp } from './stamp';
export type { BundleChunk, BundleEntry } from './types';
