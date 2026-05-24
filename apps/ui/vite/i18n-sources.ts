import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverNamespacedSources, findWorkspaceRoot } from '@brika/i18n/node';
import type { SourceConfig } from '@brika/i18n-devtools/vite';

/**
 * One-call helper that returns every `SourceConfig` the brika UI needs to
 * scan: the local `./src`, the hub's per-file-namespaced locales, every
 * workspace package under `packages/*`, and every plugin under `plugins/*`
 * (tagged with the `plugin:<full-name>` namespace prefix brika's runtime
 * uses for `tp(pluginId, key)` lookups).
 *
 * The hub is included as a *file* source — not a remote — even though the
 * UI fetches translations over HTTP at runtime. Reading them from disk at
 * scan time means validation doesn't depend on the hub being up: a dev-stack
 * boot order where the UI starts before the hub used to produce 700+ bogus
 * `unknown-key` errors until something kicked the file watcher.
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

  // Each discovered source carries its `dir` *and* its `localesDir` so the
  // dev plugin loads the actual translation JSON alongside scanning the
  // source code. Without `localesDir` the validator only sees the namespace
  // names — every `t()` call would surface as a spurious `unknown-key`.
  const attachLocales = (s: { dir: string; namespace: string }): SourceConfig => ({
    dir: s.dir,
    namespace: s.namespace,
    localesDir: join(s.dir, 'locales'),
  });

  const hubRoot = join(repoRoot, 'apps/hub/src');
  const hubSource: SourceConfig = {
    dir: hubRoot,
    // No `namespace` ⇒ per-file layout: `auth.json` → namespace `auth`,
    // matching how the hub's runtime registry serves them.
    localesDir: join(hubRoot, 'locales'),
  };

  return [
    { dir: join(viteRoot, 'src') },
    hubSource,
    ...packages.map(attachLocales),
    ...plugins.map(attachLocales),
  ];
}
