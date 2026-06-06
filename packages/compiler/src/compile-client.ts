import type { BunPlugin } from 'bun';
import { brikaActionsPlugin } from './plugins/actions-client';
import { brikaExternalsPlugin } from './plugins/externals';
import { brikaForceSideEffectsPlugin } from './plugins/force-side-effects';
import { brikaI18nCallSitePlugin } from './plugins/i18n-call-site';

export interface ClientCompileOptions {
  /** Absolute path to .tsx entrypoint */
  entrypoint: string;
  /** Absolute path to plugin root (for relative path computation in action hashes) */
  pluginRoot: string;
  /**
   * Base directory paths in injected `t()` call-site metadata are relative
   * to. Defaults to `pluginRoot`. Pass the workspace root so the resulting
   * `plugins/<pkg>/src/...` paths are resolvable by a dev server that does
   * not know about a specific plugin's layout.
   */
  sourceRoot?: string;
  /** Additional Bun plugins to inject (optional) */
  extraPlugins?: BunPlugin[];
}

export type ClientCompileResult =
  | { success: true; js: string }
  | { success: false; errors: string[] };

/**
 * Compile a single client-side module (page or brick) for the browser.
 * Returns the bundled JS string on success.
 *
 * Action files are detected automatically via `Bun.Transpiler.scan()` —
 * no pre-scanning needed. Files importing `@brika/sdk/actions` are
 * replaced with `{ __actionId }` stubs.
 */
export async function compileClientModule(
  opts: ClientCompileOptions
): Promise<ClientCompileResult> {
  const plugins: BunPlugin[] = [
    brikaExternalsPlugin(),
    brikaActionsPlugin(opts.pluginRoot),
    brikaForceSideEffectsPlugin(),
    // Inject `{ __cs: 'file:line' }` into `t('...')` calls so the i18n
    // devtools overlay can recover the source location at runtime — the
    // bundled output otherwise reports a single minified line.
    brikaI18nCallSitePlugin(opts.sourceRoot ?? opts.pluginRoot),
  ];
  if (opts.extraPlugins) {
    plugins.push(...opts.extraPlugins);
  }

  const result = await Bun.build({
    entrypoints: [opts.entrypoint],
    target: 'browser',
    format: 'esm',
    minify: true,
    plugins,
    // Return a failed result with logs instead of throwing an opaque
    // AggregateError, so callers can surface the actual build errors.
    throw: false,
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.logs.map((l) => l.message),
    };
  }

  return {
    success: true,
    js: await result.outputs[0].text(),
  };
}
