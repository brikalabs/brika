import { compileClientBundle } from '../compile-client';
import { OUTPUT_VERSION } from '../output-version';
import { stamp } from './stamp';
import type { BundleOptions, BundleResult, Bundler } from './types';

/**
 * Native backend: delegates to the `Bun.build` client pipeline (the faithful,
 * already-tested path) and stamps its provenance onto each output. Requires the
 * Bun runtime; a composition root binds it only there.
 *
 * The shared transforms in `./shared` exist for the isolate backend to reach
 * parity with this one; here Bun's own plugin chain does that work, so this
 * adapter stays a thin wrapper rather than a reimplementation.
 *
 * `Bun.build` reads the real filesystem, so unlike the isolate backend this one
 * cannot honor `BundleOptions.readFile` (in-memory sources). It fails fast on
 * that rather than silently statting virtual paths on disk.
 */
export class BunBundler implements Bundler {
  readonly backend = 'bun' as const;

  /** @param version Fingerprint stamped into output. Defaults to the compiler's macro fingerprint. */
  constructor(readonly version: string = OUTPUT_VERSION) {}

  async bundle(opts: BundleOptions): Promise<BundleResult> {
    if (opts.readFile) {
      return {
        success: false,
        backend: this.backend,
        errors: [
          'BunBundler reads from disk and cannot honor readFile (in-memory sources); use the v8 / isolate backend for a Worker.',
        ],
      };
    }
    const result = await compileClientBundle({
      entrypoints: opts.entrypoints,
      pluginRoot: opts.pluginRoot,
      sourceRoot: opts.sourceRoot,
    });
    if (!result.success) {
      return { success: false, backend: this.backend, errors: result.errors };
    }
    return {
      success: true,
      backend: this.backend,
      version: this.version,
      entries: result.entries.map((e) => ({
        entrypoint: e.entrypoint,
        js: stamp(e.js, this.backend, this.version),
      })),
      chunks: result.chunks.map((c) => ({
        name: c.name,
        js: stamp(c.js, this.backend, this.version),
      })),
    };
  }
}
