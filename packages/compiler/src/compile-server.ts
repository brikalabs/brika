import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { hashPluginSources } from './hash-sources';
import { brikaServerActionsPlugin } from './plugins/actions-server';

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
  const entryPath = join(opts.outdir, `${entryBase}.${hash}.js`);

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
    naming: `[name].${hash}.[ext]`,
    target: 'bun',
    format: 'esm',
    splitting: opts.splitting ?? true,
    minify: true,
    external: opts.external,
    plugins: [brikaServerActionsPlugin(opts.pluginRoot)],
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.logs.map((l) => l.message),
    };
  }

  return { success: true, entryPath, cached: false };
}
