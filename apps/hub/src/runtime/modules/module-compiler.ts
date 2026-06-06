import { join } from 'node:path';
import { compileClientModule, hashPluginSources } from '@brika/compiler';
import { inject, singleton } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { Logger } from '@/runtime/logs/log-router';
import { type CacheEntry, ModuleCache } from './module-cache';
import { type ManifestModules, moduleKindList } from './module-kinds';
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
  /** Entry path relative to `<root>/src` (e.g. `bricks/player.tsx`). */
  entryRel: string;
}

@singleton()
export class ModuleCompiler {
  readonly #logs = inject(Logger).withSource('hub');
  readonly #cache = new ModuleCache();
  readonly #tailwind = new TailwindCompiler();

  /**
   * Prune cache entries no longer declared in the manifest, then compile every
   * client module (page, brick, block view) the manifest declares. Kind-agnostic:
   * driven entirely by the module-kind registry.
   */
  async syncManifest(
    pluginName: string,
    rootDirectory: string,
    metadata: ManifestModules
  ): Promise<void> {
    const currentKeys = new Set(
      moduleKindList.flatMap((kind) => kind.select(metadata).map((id) => kind.cacheKey(id)))
    );
    this.prune(pluginName, currentKeys, rootDirectory);
    await this.compile(pluginName, rootDirectory, metadata);
  }

  async compile(
    pluginName: string,
    rootDirectory: string,
    metadata: ManifestModules
  ): Promise<void> {
    const modules: ModuleSpec[] = moduleKindList.flatMap((kind) =>
      kind.select(metadata).map((id) => ({
        id,
        cacheKey: kind.cacheKey(id),
        entryRel: kind.entryRel(id),
      }))
    );

    // Hash all sources once — shared across all modules so dependency
    // changes (e.g. action files) invalidate every client module.
    const hash = await hashPluginSources(rootDirectory);

    await Promise.all(
      modules.map((mod) => this.#compileModule(pluginName, mod, rootDirectory, hash))
    );
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

  // ── Per-module pipeline ────────────────────────────────────────────

  async #compileModule(
    pluginName: string,
    mod: ModuleSpec,
    rootDirectory: string,
    hash: string
  ): Promise<void> {
    const moduleId = mod.id;
    const entrypoint = join(rootDirectory, 'src', mod.entryRel);
    const cacheKey = mod.cacheKey;
    const memKey = `${pluginName}:${cacheKey}`;
    const cacheDir = pluginCacheDir(rootDirectory);

    if (!(await Bun.file(entrypoint).exists())) {
      this.#logs.warn('Module source not found', { pluginName, moduleId, path: entrypoint });
      return;
    }
    if (await this.#cache.loadFromDisk(cacheDir, memKey, cacheKey, hash)) {
      this.#logs.info('Module loaded from cache', { pluginName, moduleId });
      return;
    }

    const t0 = performance.now();
    const result = await compileClientModule({
      entrypoint,
      pluginRoot: rootDirectory,
      // Workspace-relative source paths so the dev-server's open-in-editor
      // endpoint resolves them without plugin-specific knowledge.
      sourceRoot: brikaContext.rootDir,
    });

    if (!result.success) {
      this.#logs.error('Module build failed', {
        pluginName,
        moduleId,
        errors: result.errors.join('; '),
      });
      return;
    }

    const rawJs = result.js;

    let css: string | undefined;
    try {
      css = await this.#tailwind.compileCss(rawJs, memKey);
    } catch (error) {
      this.#logs.warn('CSS compilation failed', {
        pluginName,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const js = css ? `${injectCssSnippet(css, memKey)}\n${rawJs}` : rawJs;

    await this.#cache.store(memKey, cacheDir, cacheKey, hash, js);
    this.#logs.info('Module compiled', {
      pluginName,
      moduleId,
      jsSize: js.length,
      cssSize: css?.length,
      durationMs: Math.round(performance.now() - t0),
    });
  }
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
