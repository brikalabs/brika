import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { hashPluginSources } from './hash-sources';
import { brikaServerActionsTransform } from './plugins/actions-server';
import { composeTransforms } from './plugins/compose';
import { nodeFsShimTransform } from './plugins/node-fs-shim';
import { nodeOsShimTransform } from './plugins/node-os-shim';

export interface ServerCompileOptions {
  /** Absolute path to the plugin entry (e.g., src/index.tsx) */
  entrypoint: string;
  /** Absolute path to plugin root */
  pluginRoot: string;
  /** Absolute path where built output should be written */
  outdir: string;
  /** Package names to mark as external (SDK + npm deps) */
  external: string[];
  /** Whether to enable code splitting (preserves dynamic imports). Default: true */
  splitting?: boolean;
  /**
   * Compile to JSC bytecode to cut the plugin's cold-start parse/compile time.
   * Bun emits bytecode only for a single CommonJS bundle, so enabling this
   * forces `format: 'cjs'` + `splitting: false` (overriding {@link splitting}).
   * Default: false (the esm+splitting path is unchanged). The bytecode variant
   * is cached under a distinct filename so flipping the flag never serves a
   * stale build of the other format.
   */
  bytecode?: boolean;
}

export type ServerCompileResult =
  | { success: true; entryPath: string; cached: boolean }
  | { success: false; errors: string[] };

/**
 * Compile the plugin's server-side entry point via `Bun.build`.
 *
 * Caches builds by embedding the source hash in the output filename
 * (`<name>.<hash>.js`). If the hashed file already exists, the build
 * is skipped entirely — no separate hash sidecar file needed.
 *
 * Output goes to `opts.outdir` (typically `{pluginRoot}/node_modules/.cache/brika/server/`).
 */
export async function compileServerEntry(opts: ServerCompileOptions): Promise<ServerCompileResult> {
  const entryBase = basename(opts.entrypoint).replace(/\.[tj]sx?$/, '');
  const hash = await hashPluginSources(opts.pluginRoot);
  // The bytecode build is a different output format from the same sources, so
  // it gets its own cache key, otherwise flipping `bytecode` would serve a
  // stale build of the other format. Non-bytecode keeps the plain `<hash>`
  // name, so existing caches stay valid.
  const bytecode = opts.bytecode ?? false;
  const cacheKey = bytecode ? `${hash}.bc` : hash;
  const entryPath = join(opts.outdir, `${entryBase}.${cacheKey}.js`);

  // Cache hit — hash-in-filename means no separate hash file is needed
  if (await Bun.file(entryPath).exists()) {
    return { success: true, entryPath, cached: true };
  }

  // Clean old build outputs before rebuilding
  await rm(opts.outdir, { recursive: true, force: true });
  await mkdir(opts.outdir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [opts.entrypoint],
    outdir: opts.outdir,
    naming: `[name].${cacheKey}.[ext]`,
    target: 'bun',
    // Bytecode requires a single CommonJS bundle; otherwise keep the esm +
    // code-splitting path (preserves dynamic imports across chunks).
    format: bytecode ? 'cjs' : 'esm',
    splitting: bytecode ? false : (opts.splitting ?? true),
    bytecode,
    minify: true,
    external: opts.external,
    // NOTE: deliberately NOT inlining process.env.NODE_ENV here. The server
    // bundle externalizes every dep, so there is almost no dev-branch code to
    // strip, and a plugin's own runtime `process.env.NODE_ENV` read must stay
    // dynamic (the hub forwards the real value into the plugin subprocess).
    // Return a failed result with logs instead of throwing an opaque
    // AggregateError, so callers can surface the actual build errors.
    throw: false,
    // Compose every build-time transform into a single Bun plugin —
    // see `plugins/compose.ts` for why this can't be three separate
    // plugins. Order is significant: shims rewrite import specifiers,
    // then the actions transform scans the post-shim text and appends
    // its finalization footer.
    plugins: [
      composeTransforms([
        nodeFsShimTransform(),
        nodeOsShimTransform(),
        brikaServerActionsTransform(opts.pluginRoot),
      ]),
    ],
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.logs.map((l) => l.message),
    };
  }

  return { success: true, entryPath, cached: false };
}
