import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverNamespacedSources, findWorkspaceRoot } from '@brika/i18n/node';
import type { SourceConfig } from '@brika/i18n-devtools/vite';

/**
 * One-call helper that returns every `SourceConfig` the brika UI needs to
 * scan: the local `./src`, every workspace package under `packages/*`, and
 * every plugin under `plugins/*` (tagged with the `plugin:<full-name>`
 * namespace prefix brika's runtime uses for `tp(pluginId, key)` lookups).
 *
 * Pass `import.meta.url` from `vite.config.ts` so this helper can derive its
 * own vite root and walk up to the workspace root without the caller having
 * to compute either by hand.
 */
export async function brikaI18nSources(configUrl: string): Promise<SourceConfig[]> {
  const viteRoot = dirname(fileURLToPath(configUrl));
  const repoRoot = (await findWorkspaceRoot(viteRoot)) ?? viteRoot;

  const [packages, plugins] = await Promise.all([
    discoverNamespacedSources(join(repoRoot, 'packages')),
    discoverNamespacedSources(join(repoRoot, 'plugins'), {
      transformNamespace: (name) => `plugin:${name}`,
    }),
  ]);

  return [{ dir: join(viteRoot, 'src') }, ...packages, ...plugins];
}
