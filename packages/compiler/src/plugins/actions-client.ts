import { join, relative, resolve } from 'node:path';
import type { BunPlugin } from 'bun';
import { computeActionId } from '../action-hash';

const ACTION_IMPORT = '@brika/sdk/actions';

/**
 * Client-side actions plugin — replaces action file imports with
 * synthetic `{ __actionId }` stubs. Used when building pages/bricks
 * for the browser.
 *
 * Action files are detected semantically: a file is an action file if
 * it imports from `@brika/sdk/actions`.
 * Detection uses `Bun.Transpiler.scan()` — no regex or string matching.
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
    if (await Bun.file(p).exists()) return p;
  }
  // Try index files
  for (const name of ['/index.ts', '/index.tsx']) {
    const p = base + name;
    if (await Bun.file(p).exists()) return p;
  }
  return null;
}

export function brikaActionsPlugin(pluginRoot: string): BunPlugin {
  const srcPrefix = join(pluginRoot, 'src') + '/';
  const actionFileCache = new Map<string, boolean>();

  async function checkActionFile(absPath: string): Promise<boolean> {
    const cached = actionFileCache.get(absPath);
    if (cached !== undefined) return cached;
    try {
      const content = await Bun.file(absPath).text();
      const loader = absPath.endsWith('.tsx') ? 'tsx' : 'ts';
      const { imports } = new Bun.Transpiler({ loader }).scan(content);
      const result = imports.some(i => i.path === ACTION_IMPORT);
      actionFileCache.set(absPath, result);
      return result;
    } catch {
      actionFileCache.set(absPath, false);
      return false;
    }
  }

  return {
    name: 'brika-actions',
    setup(build) {
      build.onResolve({ filter: /^\./ }, async (args) => {
        if (!args.importer || args.namespace !== 'file') return;
        const resolved = await resolveSource(args.resolveDir, args.path);
        if (!resolved?.startsWith(srcPrefix)) return;
        if (await checkActionFile(resolved)) {
          return { path: resolved, namespace: 'brika-actions' };
        }
      });

      build.onLoad({ namespace: 'brika-actions', filter: /.*/ }, async ({ path }) => {
        const content = await Bun.file(path).text();
        const loader = path.endsWith('.tsx') ? 'tsx' : 'ts';
        const { exports: names } = new Bun.Transpiler({ loader }).scan(content);
        const rel = relative(pluginRoot, path);

        return {
          contents: names
            .map((name) => `export const ${name} = { __actionId: ${JSON.stringify(computeActionId(rel, name))} };`)
            .join('\n'),
          loader: 'js',
        };
      });
    },
  };
}
