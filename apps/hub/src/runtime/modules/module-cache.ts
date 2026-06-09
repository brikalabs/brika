import { mkdir, readdir, rm, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CHUNK_DIR } from './module-kinds';

export interface CacheEntry {
  /** Short content hash used for cache-busting URLs (not an HTTP ETag). */
  hash: string;
  /** Absolute path to the JS file on disk. */
  filePath: string;
}

/**
 * Module cache: metadata in memory, JS content on disk only.
 *
 * In-memory entries store only the content hash (for URL generation) and
 * the file path (for serving). Actual JS is never held in memory.
 *
 * Disk files encode the source hash in the filename (`<type>/<id>.<hash>.js`)
 * so cache validation is a single file-exists check.
 */
export class ModuleCache {
  readonly #mem = new Map<string, CacheEntry>();

  // ── Metadata lookup ──────────────────────────────────────────────────

  get(key: string): CacheEntry | undefined {
    return this.#mem.get(key);
  }

  // ── Store (disk + metadata) ──────────────────────────────────────────

  /**
   * Write JS to disk and store metadata in memory.
   * The JS content is NOT kept in memory — only the hash and file path.
   */
  async store(
    memKey: string,
    cacheDir: string,
    moduleId: string,
    sourceHash: string,
    js: string
  ): Promise<void> {
    const dir = join(cacheDir, dirname(moduleId));
    const base = moduleId.split('/').pop() ?? moduleId;
    const target = `${base}.${sourceHash}.js`;
    const filePath = join(dir, target);

    await mkdir(dir, { recursive: true });
    await Bun.write(filePath, js);

    // Clean up stale hash variants (best-effort)
    const prefix = `${base}.`;
    readdir(dir)
      .then((entries) =>
        Promise.all(
          entries
            .filter((f) => f.startsWith(prefix) && f.endsWith('.js') && f !== target)
            .map((f) => unlink(join(dir, f)))
        )
      )
      .catch(() => undefined);

    this.#mem.set(memKey, { hash: contentHash(js), filePath });
  }

  /**
   * Try to load module metadata from disk cache. Returns true on cache hit.
   * Reads the file temporarily to compute the content hash, then discards
   * the content — only metadata is stored in memory.
   */
  async loadFromDisk(
    cacheDir: string,
    memKey: string,
    moduleId: string,
    sourceHash: string
  ): Promise<boolean> {
    const filePath = join(cacheDir, `${moduleId}.${sourceHash}.js`);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return false;
    }

    const content = await file.text();
    this.#mem.set(memKey, { hash: contentHash(content), filePath });
    return true;
  }

  /**
   * Remove in-memory entries for a plugin that are NOT in the given set of
   * current module keys. Matching stale disk files are deleted as well.
   */
  prune(pluginName: string, currentKeys: Set<string>, cacheDir: string): void {
    const prefix = `${pluginName}:`;
    for (const key of this.#mem.keys()) {
      if (key.startsWith(prefix) && !currentKeys.has(key.slice(prefix.length))) {
        const moduleId = key.slice(prefix.length);
        // Shared chunks are not declared in the manifest (and so never in
        // `currentKeys`); they are owned by the bundle build, which overwrites
        // them per source hash. Skip so prune never drops a live chunk.
        if (moduleId.startsWith(`${CHUNK_DIR}/`)) {
          continue;
        }
        const dir = join(cacheDir, dirname(moduleId));
        const base = moduleId.split('/').pop() ?? moduleId;
        readdir(dir)
          .then((entries) =>
            Promise.all(
              entries
                .filter((f) => f.startsWith(`${base}.`) && f.endsWith('.js'))
                .map((f) => unlink(join(dir, f)))
            )
          )
          .catch(() => undefined);

        this.#mem.delete(key);
      }
    }
  }

  /**
   * Delete shared-chunk files left over from a previous source hash. Chunks are
   * content-hash-named, so a source change emits new filenames and the old ones
   * (skipped by {@link prune}) would otherwise accumulate. Files for the current
   * hash are kept so a concurrent cache hit keeps resolving.
   */
  async pruneChunks(cacheDir: string, keepHash: string): Promise<void> {
    const dir = join(cacheDir, CHUNK_DIR);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return; // No chunk directory yet.
    }
    const keep = `.${keepHash}.js`;
    await Promise.all(
      files
        .filter((f) => f.endsWith('.js') && !f.endsWith(keep))
        .map((f) => unlink(join(dir, f)).catch(() => undefined))
    );
  }

  /** Remove all cached data for a plugin (in-memory + disk). */
  remove(pluginName: string, cacheDir?: string): void {
    for (const key of this.#mem.keys()) {
      if (key.startsWith(`${pluginName}:`)) {
        this.#mem.delete(key);
      }
    }
    if (cacheDir) {
      rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function contentHash(content: string): string {
  return Bun.hash(content).toString(36);
}
