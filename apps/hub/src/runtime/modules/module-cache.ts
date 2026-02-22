import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

export interface CacheEntry {
  content: string;
  etag: string;
}

interface CachedModule {
  js: CacheEntry;
  css?: CacheEntry;
}

/** Content hash of a source file — used for disk cache invalidation. */
export async function hashSource(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('blake2b256');
  hasher.update(await Bun.file(path).arrayBuffer());
  return hasher.digest('hex').slice(0, 8);
}

/**
 * Two-level module cache: in-memory for fast lookups, disk for persistence.
 * Disk files encode the content hash in the filename (`<id>.<hash>.js`)
 * so cache validation is a single file-exists check.
 */
export class ModuleCache {
  readonly #mem = new Map<string, CachedModule>();

  constructor(private readonly cacheDir: string) {}

  // ── In-memory ──────────────────────────────────────────────────────

  getJs(key: string): CacheEntry | undefined {
    return this.#mem.get(key)?.js;
  }

  getCss(key: string): CacheEntry | undefined {
    return this.#mem.get(key)?.css;
  }

  set(key: string, js: string, css?: string): void {
    this.#mem.set(key, {
      js: { content: js, etag: etag(js) },
      css: css ? { content: css, etag: etag(css) } : undefined,
    });
  }

  // ── Disk (hash-in-filename) ────────────────────────────────────────

  /** Try to load a module from disk cache. Returns true on cache hit. */
  async loadFromDisk(pluginName: string, moduleId: string, hash: string): Promise<boolean> {
    const dir = join(this.cacheDir, pluginName);
    const jsFile = Bun.file(join(dir, `${moduleId}.${hash}.js`));

    if (!(await jsFile.exists())) return false;

    const jsText = await jsFile.text();
    const cssFile = Bun.file(join(dir, `${moduleId}.${hash}.css`));
    const cssText = (await cssFile.exists()) ? await cssFile.text() : undefined;

    this.#mem.set(`${pluginName}:${moduleId}`, {
      js: { content: jsText, etag: etag(jsText) },
      css: cssText ? { content: cssText, etag: etag(cssText) } : undefined,
    });
    return true;
  }

  /** Persist a compiled module to disk. */
  async writeToDisk(pluginName: string, moduleId: string, hash: string, js: string, css?: string): Promise<void> {
    const dir = join(this.cacheDir, pluginName);
    await mkdir(dir, { recursive: true });

    await Promise.all([
      Bun.write(join(dir, `${moduleId}.${hash}.js`), js),
      css ? Bun.write(join(dir, `${moduleId}.${hash}.css`), css) : Promise.resolve(),
    ]);
  }

  /** Remove all cached data for a plugin (in-memory + disk). */
  remove(pluginName: string): void {
    for (const key of this.#mem.keys()) {
      if (key.startsWith(`${pluginName}:`)) this.#mem.delete(key);
    }
    rm(join(this.cacheDir, pluginName), { recursive: true, force: true }).catch(() => {});
  }
}

function etag(content: string): string {
  return `"${Bun.hash(content).toString(36)}"`;
}
