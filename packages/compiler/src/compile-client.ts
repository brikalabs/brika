import type { BunPlugin } from 'bun';
import { brikaActionsPlugin } from './plugins/actions-client';
import { brikaExternalsPlugin } from './plugins/externals';

export interface ClientCompileOptions {
  /** Absolute path to .tsx entrypoint */
  entrypoint: string;
  /** Absolute path to plugin root (for relative path computation in action hashes) */
  pluginRoot: string;
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
  const plugins: BunPlugin[] = [brikaExternalsPlugin(), brikaActionsPlugin(opts.pluginRoot)];
  if (opts.extraPlugins) {
    plugins.push(...opts.extraPlugins);
  }

  const result = await Bun.build({
    entrypoints: [opts.entrypoint],
    target: 'browser',
    format: 'esm',
    minify: true,
    plugins,
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
