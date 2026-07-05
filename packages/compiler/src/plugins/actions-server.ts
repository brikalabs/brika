import { join, relative } from 'node:path';
import type { BunPlugin } from 'bun';
import { actionExports, computeActionId } from '../bundle/action-scan';
import { pickLoader } from '../loader';
import type { PluginBuildTransform } from './compose';

/**
 * Server-side actions transform — detects modules that import from
 * `@brika/sdk/actions` and appends a `__finalizeActions` footer with
 * precomputed action IDs (same hash as the client transform).
 *
 * Detection and export listing use the shared `actionExports` scan, so
 * the injected ids agree with the manifest (`brika build`), the client
 * stubs and the publish-gate report by construction. The transform
 * itself is pure text append, applied to whatever content earlier
 * transforms in the compose chain produced. Order matters: this
 * transform runs AFTER the fs/os shims so the appended footer doesn't
 * see un-shimmed imports (and so the scan walks the same import graph
 * the final bundle sees).
 */
export function brikaServerActionsTransform(pluginRoot: string): PluginBuildTransform {
  const srcPrefix = `${join(pluginRoot, 'src')}/`;

  return {
    name: 'brika-server-actions',
    async transform(content, ctx) {
      if (!ctx.path.startsWith(srcPrefix)) {
        return content;
      }
      if (ctx.loader !== 'ts' && ctx.loader !== 'tsx') {
        return content;
      }

      const exports = actionExports(content, ctx.loader === 'tsx');
      if (!exports || exports.length === 0) {
        return content;
      }

      const rel = relative(pluginRoot, ctx.path);
      const idMap = Object.fromEntries(
        await Promise.all(
          exports.map(
            async (name): Promise<[string, string]> => [name, await computeActionId(rel, name)]
          )
        )
      );
      const exportList = exports.join(', ');
      const finalization = `\nimport{__finalizeActions}from'@brika/sdk/actions';__finalizeActions(${JSON.stringify(idMap)},{${exportList}});`;
      return content + finalization;
    },
  };
}

/**
 * Standalone BunPlugin wrapper — preserves the historical single-plugin
 * shape for the existing unit tests, which exercise this in isolation.
 * Production builds compose the transform via `composeTransforms`.
 */
export function brikaServerActionsPlugin(pluginRoot: string): BunPlugin {
  const transform = brikaServerActionsTransform(pluginRoot);
  return {
    name: transform.name,
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        const loader = pickLoader(args.path);
        const original = await Bun.file(args.path).text();
        const next = await transform.transform(original, { path: args.path, loader });
        if (next === original) {
          return undefined;
        }
        return { contents: next, loader };
      });
    },
  };
}
