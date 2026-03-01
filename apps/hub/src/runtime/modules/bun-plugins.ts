import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

/** CJS proxy modules — maps plugin imports to globalThis.__brika.* at build time */
const EXTERNALS: Record<string, string> = {
  react: 'module.exports=globalThis.__brika.React;',
  '@brika/sdk/ui-kit': 'module.exports=globalThis.__brika.ui;',
  '@brika/sdk/ui-kit/icons': 'module.exports=globalThis.__brika.icons;',
  'lucide-react': 'module.exports=globalThis.__brika.icons;',
  '@brika/sdk/ui-kit/hooks': 'module.exports=globalThis.__brika.hooks;',
};

/** Replaces plugin imports with globalThis.__brika proxies at build time */
export function brikaExternalsPlugin(): BunPlugin {
  return {
    name: 'brika-externals',
    setup(build) {
      build.onResolve(
        {
          filter: /^(react|@brika\/sdk|lucide-react)(\/.*)?$/,
        },
        (args) => ({
          path: args.path,
          namespace: 'brika-ext',
        })
      );

      build.onLoad(
        {
          namespace: 'brika-ext',
          filter: /.*/,
        },
        (args) => {
          if (args.path.includes('jsx-runtime') || args.path.includes('jsx-dev-runtime')) {
            return {
              contents: `const J=globalThis.__brika.jsx;export const jsx=J.jsx;export const jsxs=J.jsxs;export const jsxDEV=J.jsxDEV||J.jsx;export const Fragment=J.Fragment;`,
              loader: 'js',
            };
          }

          const proxy = EXTERNALS[args.path];
          return {
            contents: proxy ?? '',
            loader: 'js',
          };
        }
      );
    },
  };
}

/** Multiplicative hash → base36. Matches the SDK's `actionId()`. */
function actionId(index: number): string {
  return (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36);
}

/**
 * Intercepts imports of the plugin's actions file and replaces them with
 * synthetic modules containing only `{ __actionId }` refs.
 *
 * Export names are extracted via `Bun.Transpiler.scan()`, then each index is
 * hashed with `actionId()` — the same function the SDK uses at runtime.
 */
export function brikaActionsPlugin(actionsFilePath: string): BunPlugin {
  const normalizedActionsPath = resolve(actionsFilePath);

  return {
    name: 'brika-actions',
    setup(build) {
      // Intercept relative imports that resolve to the actions file
      build.onResolve(
        {
          filter: /\./,
        },
        (args) => {
          if (!args.importer || args.namespace !== 'file') {
            return;
          }
          try {
            const resolved = resolve(args.resolveDir, args.path);
            // Check common extensions
            for (const ext of ['', '.ts', '.tsx', '.js', '.jsx']) {
              if (resolved + ext === normalizedActionsPath) {
                return {
                  path: args.path,
                  namespace: 'brika-actions',
                };
              }
            }
          } catch {
            // resolve failed — not our file
          }
          return undefined;
        }
      );

      build.onLoad(
        {
          namespace: 'brika-actions',
          filter: /.*/,
        },
        async () => {
          const source = await Bun.file(normalizedActionsPath).text();
          const transpiler = new Bun.Transpiler({
            loader: 'ts',
          });
          const { exports: names } = transpiler.scan(source);

          // scan() returns alphabetical — re-sort to source order so
          // indices match the runtime's defineAction() execution order
          names.sort(
            (a, b) => source.indexOf(`export const ${a}`) - source.indexOf(`export const ${b}`)
          );

          const lines = names.map(
            (name, i) => `export const ${name} = { __actionId: '${actionId(i)}' };`
          );

          return {
            contents: lines.join('\n'),
            loader: 'js',
          };
        }
      );
    },
  };
}
