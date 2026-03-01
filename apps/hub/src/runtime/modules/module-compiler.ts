import { join } from 'node:path';
import { inject, singleton } from '@brika/di';
import type { BunPlugin } from 'bun';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { brikaActionsPlugin, brikaExternalsPlugin } from './bun-plugins';
import { type CacheEntry, hashSource, ModuleCache } from './module-cache';
import { TailwindCompiler } from './tailwind';

@singleton()
export class ModuleCompiler {
  readonly #logs = inject(Logger).withSource('hub');
  readonly #cache = new ModuleCache(join(inject(ConfigLoader).brikaDir, 'cache', 'modules'));
  readonly #tailwind = new TailwindCompiler();

  async compile(
    pluginName: string,
    rootDirectory: string,
    modules: Array<{
      id: string;
    }>,
    actionsFile?: string
  ): Promise<void> {
    const plugins: BunPlugin[] = [brikaExternalsPlugin()];
    if (actionsFile) {
      plugins.push(brikaActionsPlugin(actionsFile));
    }

    await Promise.all(
      modules.map((mod) => this.#compileModule(pluginName, mod.id, rootDirectory, plugins))
    );
  }

  get(key: string): CacheEntry | undefined {
    return this.#cache.getJs(key);
  }

  getStyle(key: string): CacheEntry | undefined {
    return this.#cache.getCss(key);
  }

  remove(pluginName: string): void {
    this.#cache.remove(pluginName);
  }

  // ── Per-module pipeline ────────────────────────────────────────────

  async #compileModule(
    pluginName: string,
    moduleId: string,
    rootDirectory: string,
    plugins: BunPlugin[]
  ): Promise<void> {
    const entrypoint = join(rootDirectory, 'src', 'pages', `${moduleId}.tsx`);

    if (!(await Bun.file(entrypoint).exists())) {
      this.#logs.warn('Module source not found', {
        pluginName,
        moduleId,
        path: entrypoint,
      });
      return;
    }

    const hash = await hashSource(entrypoint);
    if (await this.#cache.loadFromDisk(pluginName, moduleId, hash)) {
      this.#logs.info('Module loaded from cache', {
        pluginName,
        moduleId,
      });
      return;
    }

    const result = await Bun.build({
      entrypoints: [entrypoint],
      target: 'browser',
      format: 'esm',
      minify: true,
      plugins,
    });
    if (!result.success) {
      this.#logs.error('Module build failed', {
        pluginName,
        moduleId,
        errors: result.logs.map((l) => l.message).join('; '),
      });
      return;
    }

    const js = await result.outputs[0].text();
    const css = await this.#compileCss(pluginName, moduleId, js);

    this.#cache.set(`${pluginName}:${moduleId}`, js, css);
    await this.#cache.writeToDisk(pluginName, moduleId, hash, js, css);
    this.#logs.info('Module compiled', {
      pluginName,
      moduleId,
      jsSize: js.length,
      cssSize: css?.length,
    });
  }

  async #compileCss(pluginName: string, moduleId: string, js: string): Promise<string | undefined> {
    try {
      return await this.#tailwind.compileCss(js);
    } catch (error) {
      this.#logs.warn('CSS compilation failed', {
        pluginName,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}
