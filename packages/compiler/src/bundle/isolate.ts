import { dirname, extname, resolve as resolvePath } from 'node:path';
import { type Plugin, rollup } from '@rollup/browser';
import { transform } from 'sucrase';
import { actionExports } from './action-scan';
import { applyI18n, bridgePropFor, isBareSpecifier } from './shared';
import { stamp } from './stamp';
import type { BundleChunk, BundleEntry, BundleOptions, BundleResult, Bundler } from './types';

/** Prefix for the virtual modules that stand in for host-bridged imports. */
const BRIDGE_NS = '\0bridge:';
/** Filename prefix Bun gives shared chunks; matched so both backends serve alike. */
const CHUNK_PREFIX = '_brika_chunk_';
const SOURCE_RE = /\.(?:tsx|ts|jsx|js|mts|cts|mjs|cjs)$/;
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

/**
 * Default source reader (Bun/Node). The `node:fs/promises` import is dynamic so
 * the module still LOADS in a Worker, but this reader is not edge-safe: a Worker
 * caller must pass `opts.readFile` (compilePluginGate always does).
 */
async function nodeRead(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf8');
}

/**
 * Portable backend: rollup (pure-JS browser build) + sucrase + terser, all of
 * which run in a V8 isolate / Cloudflare Worker. Produces the same servable
 * module shape as `BunBundler` (bridged imports rewired to `globalThis.__brika`,
 * relative graph bundled, shared code split into `_brika_chunk_*`), reusing the
 * shared transforms so the *logic* is identical to the Bun path.
 */
export class IsolateBundler implements Bundler {
  readonly backend = 'isolate' as const;

  /**
   * @param version Fingerprint stamped into output, injected by the composition
   *   root (the Bun `output-version` macro on the hub, or a build-time define in
   *   a Worker). Kept off the macro so this file bundles for a V8 isolate.
   */
  constructor(readonly version: string = 'dev') {}

  async bundle(opts: BundleOptions): Promise<BundleResult> {
    // Nothing to bundle. Match compileClientBundle (the Bun backend), which
    // short-circuits empty entrypoints to success; rollup instead throws on an
    // empty `input`, which would reject a valid server-only/tools-only plugin.
    if (opts.entrypoints.length === 0) {
      return {
        success: true,
        backend: this.backend,
        version: this.version,
        entries: [],
        chunks: [],
      };
    }

    const read = opts.readFile ?? nodeRead;
    const sourceRoot = opts.sourceRoot ?? opts.pluginRoot;
    const cache = new Map<string, string>();
    // For action stubbing: the plugin's own `src/` and the entrypoints (which
    // must never be stubbed, even if a brick itself imports an action module).
    const pluginSrc = `${opts.pluginRoot}/src/`;
    const entrypointSet = new Set(opts.entrypoints);

    // Read `path`, memoizing so resolveId's probe and load share one read.
    const readCached = async (path: string): Promise<string | null> => {
      const hit = cache.get(path);
      if (hit !== undefined) {
        return hit;
      }
      try {
        const text = await read(path);
        cache.set(path, text);
        return text;
      } catch {
        return null;
      }
    };

    const plugin: Plugin = {
      name: 'brika-isolate',
      async resolveId(id, importer) {
        const prop = bridgePropFor(id);
        if (prop !== undefined) {
          // Host provides this at runtime; never bundle it.
          return `${BRIDGE_NS}${prop}`;
        }
        if (id.startsWith(BRIDGE_NS)) {
          return id;
        }
        if (isBareSpecifier(id)) {
          // Declared deps, npm packages (recharts) and browser-safe SDK subpaths
          // (@brika/sdk/brick, @brika/sdk/media) are marked external. This is a
          // compile GATE over the plugin's OWN source (like the CLI's
          // `assertCompiles`), not a producer of servable bytes: serving would
          // require bundling these from their sources via `readFile` (the
          // node_modules milestone), so isolate output is checkable, not servable.
          return { id, external: true };
        }
        const base = importer ? resolvePath(dirname(importer), id) : id;
        for (const ext of RESOLVE_EXTS) {
          if ((await readCached(base + ext)) !== null) {
            return base + ext;
          }
        }
        return null;
      },
      async load(id) {
        if (id.startsWith(BRIDGE_NS)) {
          // ESM stub: named imports resolve to properties of the host global via
          // synthetic-named-exports (`import { jsx }` -> `globalThis.__brika.jsx.jsx`).
          return {
            code: `export default globalThis.__brika.${id.slice(BRIDGE_NS.length)};`,
            syntheticNamedExports: 'default',
          };
        }
        return await readCached(id);
      },
      transform(code, id) {
        if (id.startsWith(BRIDGE_NS) || !SOURCE_RE.test(id)) {
          return null;
        }
        // Stub a non-entry action file (under the plugin's src/) so the gate does
        // not compile its server subtree as browser code - matching the hub's
        // brikaActionsPlugin. Detection is on the type-stripped source, so a brick
        // that only `import type`s from @brika/sdk/actions is NOT an action file.
        if (!entrypointSet.has(id) && id.startsWith(pluginSrc)) {
          const names = actionExports(code, extname(id).endsWith('x'));
          if (names) {
            return names
              .map((n) => (n === 'default' ? 'export default {};' : `export const ${n} = {};`))
              .join('\n');
          }
        }
        const underSource = !id.includes('/node_modules/') && id.startsWith(`${sourceRoot}/`);
        const injected = underSource ? applyI18n(code, relFrom(sourceRoot, id)) : code;
        const jsx = extname(id).endsWith('x');
        return transform(injected, {
          transforms: jsx ? ['typescript', 'jsx'] : ['typescript'],
          jsxRuntime: 'automatic',
          production: true,
          filePath: id,
        }).code;
      },
    };

    // Index-keyed inputs so each output entry maps back to its source entrypoint.
    // Keying by basename would silently drop a same-named entry across kinds
    // (e.g. `bricks/devices.tsx` + `pages/devices.tsx`), letting a broken module
    // pass the gate unchecked.
    const input: Record<string, string> = {};
    const nameToEntry = new Map<string, string>();
    opts.entrypoints.forEach((abs, i) => {
      const name = `entry${i}`;
      input[name] = abs;
      nameToEntry.set(name, abs);
    });

    try {
      const build = await rollup({
        input,
        plugins: [plugin],
        onwarn() {
          // Warnings (unresolved externals, empty chunks) are expected here; the
          // compile succeeds or throws, which is the only signal we act on.
        },
      });
      const { output } = await build.generate({
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: `${CHUNK_PREFIX}[hash].js`,
        minifyInternalExports: false,
      });

      const entries: BundleEntry[] = [];
      const chunks: BundleChunk[] = [];
      for (const out of output) {
        if (out.type !== 'chunk') {
          continue;
        }
        const stamped = stamp(out.code, this.backend, this.version);
        if (out.isEntry) {
          const entrypoint = nameToEntry.get(out.name);
          if (entrypoint) {
            entries.push({ entrypoint, js: stamped });
          }
        } else {
          chunks.push({ name: out.fileName.replace(/\.js$/, ''), js: stamped });
        }
      }
      return { success: true, backend: this.backend, version: this.version, entries, chunks };
    } catch (err) {
      return {
        success: false,
        backend: this.backend,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }
}

/**
 * Path of `abs` relative to `root`, forward-slashed. Requires a `/` boundary so
 * a sibling sharing the prefix (`/plugin` vs `/plugin-utils`) is not mis-sliced.
 */
function relFrom(root: string, abs: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
}
