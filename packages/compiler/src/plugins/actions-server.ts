import { join, relative } from 'node:path';
import type { BunPlugin } from 'bun';
import { computeActionId } from '../action-hash';

const ACTION_IMPORT = '@brika/sdk/actions';

/**
 * Server-side actions plugin — appends `__finalizeActions` calls to action
 * modules with precomputed action IDs (same hash as the client plugin).
 *
 * Detection: uses `Bun.Transpiler.scan()` to check if a file imports from
 * `@brika/sdk/actions`. No regex, no string matching on source content.
 *
 * Transformation: appends a finalization call at the end of the module
 * (string concatenation, not regex replacement). IDs are computed at build
 * time using `computeActionId(relativePath, exportName)`.
 */
export function brikaServerActionsPlugin(pluginRoot: string): BunPlugin {
  const srcPrefix = join(pluginRoot, 'src') + '/';

  return {
    name: 'brika-server-actions',
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        if (!args.path.startsWith(srcPrefix)) return;

        const content = await Bun.file(args.path).text();
        const loader: 'tsx' | 'ts' = args.path.endsWith('.tsx') ? 'tsx' : 'ts';
        const { imports, exports } = new Bun.Transpiler({ loader }).scan(content);

        if (!imports.some(i => i.path === ACTION_IMPORT) || exports.length === 0) return;

        const rel = relative(pluginRoot, args.path);
        const idMap = Object.fromEntries(exports.map(name => [name, computeActionId(rel, name)]));
        const exportList = exports.join(', ');
        const finalization = `\nimport{__finalizeActions}from'${ACTION_IMPORT}';__finalizeActions(${JSON.stringify(idMap)},{${exportList}});`;

        return {
          contents: content + finalization,
          loader,
        };
      });
    },
  };
}
