/**
 * Compose multiple build-time transforms into a single Bun.build plugin.
 *
 * Why this exists: `Bun.build`'s plugin contract honours **only the first**
 * `onLoad` handler that returns content for a given file. Two plugins
 * with overlapping filters silently shadow each other — the one
 * registered first wins, the second never runs on those files. We hit
 * exactly that bug when the actions plugin and the fs-shim plugin both
 * matched `.ts` files: action files got the actions transform but
 * missed the fs shim, so `mkdir('/data')` reached the real OS instead
 * of the grant runtime.
 *
 * The fix is to compose every build-time transform inside one `onLoad`
 * so they each see the previous transform's output. New transforms
 * (e.g. a future macro / inliner) just register here — they don't need
 * to coordinate with siblings.
 */

import type { BunPlugin } from 'bun';
import { type Loader, pickLoader } from '../loader';

export interface TransformContext {
  /** Absolute path of the file being loaded. */
  readonly path: string;
  /** Loader Bun should use for the final emit. */
  readonly loader: Loader;
}

export interface PluginBuildTransform {
  /** Used in error messages and the BunPlugin name when wrapped. */
  readonly name: string;
  /**
   * Pure text transform. Receives the content as produced by earlier
   * transforms in the chain and returns the next version. Return the
   * input unchanged when nothing applies.
   */
  transform(content: string, ctx: TransformContext): string | Promise<string>;
}

export interface ComposeOptions {
  /** Name reported in the BunPlugin manifest. */
  readonly name?: string;
}

/**
 * Wrap an ordered list of transforms into one BunPlugin that runs them
 * sequentially inside a single `onLoad`. The bundler sees one rewrite
 * per file, regardless of how many transforms touched it.
 */
export function composeTransforms(
  transforms: ReadonlyArray<PluginBuildTransform>,
  opts: ComposeOptions = {}
): BunPlugin {
  return {
    name: opts.name ?? 'brika-plugin-transforms',
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        const original = await Bun.file(args.path).text();
        const loader = pickLoader(args.path);
        const ctx: TransformContext = { path: args.path, loader };

        let current = original;
        for (const t of transforms) {
          current = await t.transform(current, ctx);
        }

        if (current === original) {
          return undefined;
        }
        return { contents: current, loader };
      });
    },
  };
}
