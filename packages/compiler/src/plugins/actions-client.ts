import { join, relative, resolve } from 'node:path';
import type { BunPlugin } from 'bun';
import { actionExports, computeActionId } from '../bundle/action-scan';

/**
 * Client-side actions plugin — replaces action file imports with
 * synthetic `{ __actionId }` stubs. Used when building pages/bricks
 * for the browser.
 *
 * Detection and export listing use the shared `actionExports` scan
 * (a file is an action file iff it value-imports `@brika/sdk/actions`),
 * so the stubbed ids agree with the server build, the manifest and the
 * publish-gate report by construction.
 */
async function resolveSource(dir: string, specifier: string): Promise<string | null> {
  const base = resolve(dir, specifier);
  // Specifier already has extension
  if (/\.[tj]sx?$/.test(specifier)) {
    return (await Bun.file(base).exists()) ? base : null;
  }
  // Try extensions
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const p = base + ext;
    if (await Bun.file(p).exists()) {
      return p;
    }
  }
  // Try index files
  for (const name of ['/index.ts', '/index.tsx']) {
    const p = base + name;
    if (await Bun.file(p).exists()) {
      return p;
    }
  }
  return null;
}

export function brikaActionsPlugin(pluginRoot: string): BunPlugin {
  const srcPrefix = `${join(pluginRoot, 'src')}/`;
  // Per-file scan result: the exported names of an action file, or null for a
  // non-action file. Cached so onResolve's probe and onLoad share one scan.
  const namesCache = new Map<string, string[] | null>();

  async function actionNames(absPath: string): Promise<string[] | null> {
    const hit = namesCache.get(absPath);
    if (hit !== undefined) {
      return hit;
    }
    let names: string[] | null;
    try {
      const content = await Bun.file(absPath).text();
      names = actionExports(content, /[jt]sx$/.test(absPath));
    } catch {
      names = null;
    }
    namesCache.set(absPath, names);
    return names;
  }

  return {
    name: 'brika-actions',
    setup(build) {
      build.onResolve({ filter: /^\./ }, async (args) => {
        if (!args.importer || args.namespace !== 'file') {
          return;
        }
        const resolved = await resolveSource(args.resolveDir, args.path);
        if (!resolved?.startsWith(srcPrefix)) {
          return;
        }
        if ((await actionNames(resolved)) !== null) {
          return { path: resolved, namespace: 'brika-actions' };
        }
      });

      build.onLoad({ namespace: 'brika-actions', filter: /.*/ }, async ({ path }) => {
        const names = (await actionNames(path)) ?? [];
        const rel = relative(pluginRoot, path);
        const stubs = await Promise.all(
          names.map(
            async (name) =>
              `export const ${name} = { __actionId: ${JSON.stringify(await computeActionId(rel, name))} };`
          )
        );

        return { contents: stubs.join('\n'), loader: 'js' };
      });
    },
  };
}
