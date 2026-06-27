/**
 * Resolve the `--preload` path for plugin processes.
 *
 * The plugin child is a SEPARATE plain-bun process, so the prelude must be a
 * real file on the real filesystem:
 *
 *   - dev (hub runs from source): the prelude source sits next to this file,
 *     and the child transpiles the TS graph itself -- use the source path.
 *   - compiled binary / Docker bundle: the source tree isn't on disk (a
 *     compiled binary only sees it under the `/$bunfs/` virtual filesystem,
 *     which children can't read -- the cause of
 *     `preload not found "/$bunfs/root/prelude/index.ts"`). The build embeds a
 *     self-contained bundle as the virtual module `brika:embedded-prelude`
 *     (see `apps/build/src/plugins/embed-prelude.ts`); materialize it to
 *     `<systemDir>/runtime/prelude-<hash>.js` once and preload that.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE_PRELUDE_PATH = join(import.meta.dir, 'prelude', 'index.ts');

let resolved: Promise<string> | undefined;

/** Memoized: the materialization runs once per hub process. */
export function resolvePreludePath(systemDir: string): Promise<string> {
  resolved ??= locate(systemDir);
  return resolved;
}

async function locate(systemDir: string): Promise<string> {
  if (await Bun.file(SOURCE_PRELUDE_PATH).exists()) {
    return SOURCE_PRELUDE_PATH;
  }
  const { default: source } = await import('brika:embedded-prelude');
  return materializePrelude(source, systemDir);
}

/**
 * Write the embedded prelude source to `<systemDir>/runtime/prelude-<hash>.js`
 * (content-addressed, written once). Exposed for testing; production callers
 * use {@link resolvePreludePath}.
 */
export async function materializePrelude(source: string, systemDir: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(source);
  const hash = hasher.digest('hex').slice(0, 16);
  const dir = join(systemDir, 'runtime');
  const path = join(dir, `prelude-${hash}.js`);
  if (!(await Bun.file(path).exists())) {
    await mkdir(dir, { recursive: true });
    await Bun.write(path, source);
  }
  return path;
}
