import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BunBundler,
  type BundleChunk,
  compileClientModule,
  hashPluginSources,
} from '@brika/compiler';
import { inject, singleton } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { Logger } from '@/runtime/logs/log-router';
import { type CacheEntry, ModuleCache } from './module-cache';
import {
  CHUNK_DIR,
  chunkCacheKey,
  chunkScopeId,
  type ManifestModules,
  type ModuleKind,
  moduleKindList,
  moduleScopeId,
} from './module-kinds';
import { TailwindCompiler } from './tailwind';

/** Compute the per-plugin cache directory. */
function pluginCacheDir(rootDirectory: string): string {
  return join(rootDirectory, 'node_modules', '.cache', 'brika');
}

/** A single client module to compile (page, brick or block view). */
interface ModuleSpec {
  /** Module id used for logging (e.g. brick/page/block id). */
  id: string;
  /** Cache key relative to the plugin (e.g. `bricks/player`, `blocks/x.view`). */
  cacheKey: string;
  /** `<plugin>:<cacheKey>` cache + lookup key. */
  memKey: string;
  /** Absolute path to the `.tsx` entrypoint. */
  entrypoint: string;
}

/** Outcome of compiling one module kind, surfaced for live build progress. */
export interface KindCompileResult {
  /** The module kind built (e.g. `brick`, `page`, `blockView`). */
  kind: string;
  /** Number of modules compiled or loaded for this kind. */
  modules: number;
  /** Shared chunks emitted (0 on a cache hit or a single-module kind). */
  chunks: number;
  /** True when every module of the kind was served from disk cache. */
  cached: boolean;
  /** Wall-clock time spent on this kind. */
  durationMs: number;
}

/** What a full client compile produced, one entry per kind that had modules. */
export interface CompileSummary {
  kinds: KindCompileResult[];
}

@singleton()
export class ModuleCompiler {
  readonly #logs = inject(Logger).withSource('hub');
  readonly #cache = new ModuleCache();
  readonly #tailwind = new TailwindCompiler();
  // The hub always runs under Bun, so it binds the Bun backend explicitly. Its
  // backend + version go into the cache key so a future isolate-built artifact
  // never cross-serves.
  readonly #bundler = new BunBundler();

  /**
   * Prune cache entries no longer declared in the manifest, then compile every
   * client module (page, brick, block view) the manifest declares. Kind-agnostic:
   * driven entirely by the module-kind registry.
   */
  syncManifest(
    pluginName: string,
    rootDirectory: string,
    metadata: ManifestModules
  ): Promise<CompileSummary> {
    const currentKeys = new Set(
      moduleKindList.flatMap((kind) => kind.select(metadata).map((id) => kind.cacheKey(id)))
    );
    this.prune(pluginName, currentKeys, rootDirectory);
    return this.compile(pluginName, rootDirectory, metadata);
  }

  /**
   * Compile every client module the manifest declares. Modules are grouped by
   * kind and each kind is built together with code splitting, so a heavy
   * dependency shared by several modules of the same kind (e.g. recharts pulled
   * in by multiple bricks) lands in one shared chunk instead of being
   * duplicated into every module's bundle.
   */
  async compile(
    pluginName: string,
    rootDirectory: string,
    metadata: ManifestModules
  ): Promise<CompileSummary> {
    // Hash all sources once, shared across all modules so dependency
    // changes (e.g. action files) invalidate every client module. The active
    // bundler's backend + version is folded in, so a switch of backend (or a
    // bump of either compiler) invalidates rather than cross-serves stale bytes.
    const hash = await hashPluginSources(
      rootDirectory,
      `${this.#bundler.backend}@${this.#bundler.version}`
    );
    const cacheDir = pluginCacheDir(rootDirectory);

    // Drop shared chunks orphaned by a prior source version before (re)building.
    await this.#cache.pruneChunks(cacheDir, hash);

    const results = await Promise.all(
      moduleKindList.map((kind) =>
        this.#compileKind(pluginName, kind, rootDirectory, cacheDir, metadata, hash)
      )
    );
    return { kinds: results.filter((r): r is KindCompileResult => r !== undefined) };
  }

  get(key: string): CacheEntry | undefined {
    return this.#cache.get(key);
  }

  prune(pluginName: string, currentKeys: Set<string>, rootDirectory: string): void {
    this.#cache.prune(pluginName, currentKeys, pluginCacheDir(rootDirectory));
  }

  remove(pluginName: string, rootDirectory?: string): void {
    this.#cache.remove(pluginName, rootDirectory ? pluginCacheDir(rootDirectory) : undefined);
  }

  // ── Per-kind pipeline ──────────────────────────────────────────────

  /** Resolve the on-disk entrypoints a kind declares, warning on missing sources. */
  async #specsForKind(
    pluginName: string,
    kind: ModuleKind,
    rootDirectory: string,
    metadata: ManifestModules
  ): Promise<ModuleSpec[]> {
    const specs: ModuleSpec[] = [];
    for (const id of kind.select(metadata)) {
      const entrypoint = join(rootDirectory, 'src', kind.entryRel(id));
      if (!(await Bun.file(entrypoint).exists())) {
        this.#logs.warn('Module source not found', { pluginName, moduleId: id, path: entrypoint });
        continue;
      }
      specs.push({
        id,
        cacheKey: kind.cacheKey(id),
        memKey: moduleScopeId(pluginName, kind, id),
        entrypoint,
      });
    }
    return specs;
  }

  async #compileKind(
    pluginName: string,
    kind: ModuleKind,
    rootDirectory: string,
    cacheDir: string,
    metadata: ManifestModules,
    hash: string
  ): Promise<KindCompileResult | undefined> {
    const t0 = performance.now();
    const specs = await this.#specsForKind(pluginName, kind, rootDirectory, metadata);
    if (specs.length === 0) {
      return undefined;
    }

    // Cache hit only when every entry of the kind is on disk for this hash; the
    // hash is plugin-wide, so a source change rebuilds the whole kind together.
    const cached = await Promise.all(
      specs.map((s) => this.#cache.loadFromDisk(cacheDir, s.memKey, s.cacheKey, hash))
    );
    if (cached.every(Boolean)) {
      const chunks = await this.#loadChunksFromDisk(pluginName, cacheDir, hash);
      this.#logs.info('Modules loaded from cache', {
        pluginName,
        kind: kind.name,
        count: specs.length,
      });
      return {
        kind: kind.name,
        modules: specs.length,
        chunks,
        cached: true,
        durationMs: Math.round(performance.now() - t0),
      };
    }

    const result = await this.#bundler.bundle({
      entrypoints: specs.map((s) => s.entrypoint),
      pluginRoot: rootDirectory,
      // Workspace-relative source paths so the dev-server's open-in-editor
      // endpoint resolves them without plugin-specific knowledge.
      sourceRoot: brikaContext.rootDir,
    });
    if (!result.success) {
      // A bundle is all-or-nothing, so one broken module would otherwise blank
      // out every healthy sibling of the same kind. Degrade to compiling each
      // module on its own (no shared chunks) so a single failure stays isolated.
      this.#logs.warn('Bundle build failed; falling back to per-module compile', {
        pluginName,
        kind: kind.name,
        errors: result.errors.join('; '),
      });
      const stored = await Promise.all(
        specs.map((spec) =>
          this.#compileStandalone(pluginName, kind, spec, rootDirectory, cacheDir, hash)
        )
      );
      return {
        kind: kind.name,
        modules: stored.filter(Boolean).length,
        chunks: 0,
        cached: false,
        durationMs: Math.round(performance.now() - t0),
      };
    }

    // Persist shared chunks first so an entry's chunk import resolves the moment
    // the entry is served. Chunks carry no CSS (utilities are scoped per module).
    await Promise.all(
      result.chunks.map((chunk) =>
        this.#cache.store(
          chunkScopeId(pluginName, chunk.name),
          cacheDir,
          chunkCacheKey(chunk.name),
          hash,
          chunk.js
        )
      )
    );

    const specByEntrypoint = new Map(specs.map((s) => [s.entrypoint, s]));
    await Promise.all(
      result.entries.map((entry) => {
        // Scan the entry's CSS over only the chunks it transitively imports, so a
        // brick that doesn't pull a heavy shared chunk (e.g. recharts) neither
        // ships that chunk's utilities nor pays to scan its 100s of KB. Following
        // chunk->chunk edges (not just the entry's direct imports) keeps a class
        // that lives in a nested chunk from silently dropping out of the CSS.
        const importedChunkJs = reachableChunks(entry.js, result.chunks)
          .map((chunk) => chunk.js)
          .join('\n');
        return this.#storeEntry(
          pluginName,
          kind,
          specByEntrypoint.get(entry.entrypoint),
          entry.js,
          importedChunkJs,
          cacheDir,
          hash
        );
      })
    );

    const durationMs = Math.round(performance.now() - t0);
    this.#logs.info('Modules compiled', {
      pluginName,
      kind: kind.name,
      count: result.entries.length,
      chunks: result.chunks.length,
      durationMs,
    });
    return {
      kind: kind.name,
      modules: result.entries.length,
      chunks: result.chunks.length,
      cached: false,
      durationMs,
    };
  }

  /** Compile CSS for one entry, prepend its self-injecting snippet, and cache it. */
  async #storeEntry(
    pluginName: string,
    kind: ModuleKind,
    spec: ModuleSpec | undefined,
    entryJs: string,
    chunkJs: string,
    cacheDir: string,
    hash: string
  ): Promise<void> {
    if (!spec) {
      return;
    }
    // Scan the entry AND its shared chunks for utilities: a class used only by
    // code that was hoisted into a shared chunk would otherwise be missed. The
    // CSS is still scoped to this module's own `data-brika-scope` container.
    const cssSource = chunkJs ? `${entryJs}\n${chunkJs}` : entryJs;
    let css: string | undefined;
    try {
      css = await this.#tailwind.compileCss(cssSource, spec.memKey);
    } catch (error) {
      this.#logs.warn('CSS compilation failed', {
        pluginName,
        moduleId: spec.id,
        kind: kind.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const js = css ? `${injectCssSnippet(css, spec.memKey)}\n${entryJs}` : entryJs;
    await this.#cache.store(spec.memKey, cacheDir, spec.cacheKey, hash, js);
  }

  /**
   * Fallback path: compile a single module on its own (no code splitting) when
   * the kind's bundle build fails, so a broken module never takes its healthy
   * siblings down with it.
   */
  async #compileStandalone(
    pluginName: string,
    kind: ModuleKind,
    spec: ModuleSpec,
    rootDirectory: string,
    cacheDir: string,
    hash: string
  ): Promise<boolean> {
    const result = await compileClientModule({
      entrypoint: spec.entrypoint,
      pluginRoot: rootDirectory,
      sourceRoot: brikaContext.rootDir,
    });
    if (!result.success) {
      this.#logs.error('Module build failed', {
        pluginName,
        moduleId: spec.id,
        kind: kind.name,
        errors: result.errors.join('; '),
      });
      return false;
    }
    await this.#storeEntry(pluginName, kind, spec, result.js, '', cacheDir, hash);
    return true;
  }

  /**
   * Re-register shared chunks from disk on a cache hit. Chunk filenames are
   * content-hashed by Bun, so they can't be reconstructed from a module id;
   * discover them by scanning the chunk directory for the current source hash.
   * Returns the number of chunks registered.
   */
  async #loadChunksFromDisk(pluginName: string, cacheDir: string, hash: string): Promise<number> {
    const suffix = `.${hash}.js`;
    let files: string[];
    try {
      files = await readdir(join(cacheDir, CHUNK_DIR));
    } catch {
      return 0; // No chunk directory: the build produced no shared chunks.
    }
    const chunkFiles = files.filter((f) => f.endsWith(suffix));
    await Promise.all(
      chunkFiles.map((f) => {
        const chunkName = f.slice(0, -suffix.length);
        return this.#cache.loadFromDisk(
          cacheDir,
          chunkScopeId(pluginName, chunkName),
          chunkCacheKey(chunkName),
          hash
        );
      })
    );
    return chunkFiles.length;
  }
}

/**
 * The chunks transitively reachable from an entry: the chunks it imports
 * directly, plus the chunks those import, and so on. A chunk references another
 * by its `_brika_chunk_*` name in an import statement, so reachability is a
 * substring walk over the chunk graph. Used to gather the full set of code whose
 * Tailwind classes an entry's scoped CSS must cover.
 *
 * Exported for unit testing the graph walk (transitive edges, cycles).
 */
export function reachableChunks(entryJs: string, chunks: readonly BundleChunk[]): BundleChunk[] {
  const byName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const seen = new Set<string>();
  const queue = chunks.filter((chunk) => entryJs.includes(chunk.name)).map((chunk) => chunk.name);
  const out: BundleChunk[] = [];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const chunk = byName.get(name);
    if (!chunk) {
      continue;
    }
    out.push(chunk);
    for (const other of chunks) {
      if (!seen.has(other.name) && chunk.js.includes(other.name)) {
        queue.push(other.name);
      }
    }
  }
  return out;
}

/**
 * Generates a JS snippet that injects CSS into <head> as a scoped <style> tag.
 * Idempotent: uses a data-brika-css attribute keyed by module so re-imports
 * don't duplicate styles.
 */
function injectCssSnippet(css: string, moduleKey: string): string {
  const escaped = css.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
  const escapedKey = moduleKey.replaceAll('"', '\\"');
  return `(function(){var k="${escapedKey}";if(document.querySelector('style[data-brika-css="'+k+'"]'))return;var s=document.createElement("style");s.setAttribute("data-brika-css",k);s.textContent=\`${escaped}\`;document.head.appendChild(s)})();`;
}
