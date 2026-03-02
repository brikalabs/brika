import { join } from 'node:path';
import { inject, singleton } from '@brika/di';
import { compileClientModule, hashPluginSources } from '@brika/compiler';
import { Logger } from '@/runtime/logs/log-router';
import { type CacheEntry, ModuleCache } from './module-cache';
import { TailwindCompiler } from './tailwind';

/** Compute the per-plugin cache directory. */
function pluginCacheDir(rootDirectory: string): string {
  return join(rootDirectory, 'node_modules', '.cache', 'brika');
}

@singleton()
export class ModuleCompiler {
  readonly #logs = inject(Logger).withSource('hub');
  readonly #cache = new ModuleCache();
  readonly #tailwind = new TailwindCompiler();

  async compile(
    pluginName: string,
    rootDirectory: string,
    opts: {
      pages?: Array<{ id: string }>;
      bricks?: Array<{ id: string }>;
    }
  ): Promise<void> {
    const modules = [
      ...(opts.pages ?? []).map((m) => ({ id: m.id, sourceDir: 'pages' })),
      ...(opts.bricks ?? []).map((m) => ({ id: m.id, sourceDir: 'bricks' })),
    ];

    // Hash all sources once — shared across all modules so dependency
    // changes (e.g. action files) invalidate every client module.
    const hash = await hashPluginSources(rootDirectory);

    await Promise.all(
      modules.map((mod) =>
        this.#compileModule(pluginName, mod.id, rootDirectory, mod.sourceDir, hash)
      )
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
    moduleId: string,
    rootDirectory: string,
    sourceDir: string,
    hash: string
  ): Promise<void> {
    const entrypoint = join(rootDirectory, 'src', sourceDir, `${moduleId}.tsx`);
    const cacheKey = `${sourceDir}/${moduleId}`;
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
