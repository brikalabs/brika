import { join } from 'node:path';
import type { BunPlugin } from 'bun';

/**
 * Embed the plugin-runtime prelude into production builds.
 *
 * The hub injects `apps/hub/src/runtime/plugins/prelude/index.ts` into every
 * plugin process via `bun --preload=<path>`. In dev that path is real source
 * on disk, but a compiled binary only carries it inside the `/$bunfs/` virtual
 * filesystem (and a Docker bundle doesn't carry it at all) — the spawned child
 * is a separate plain-bun process that cannot see either, so every plugin
 * crashed with `preload not found "/$bunfs/root/prelude/index.ts"`.
 *
 * Fix: bundle the prelude's full module graph into one self-contained JS
 * string ({@link bundlePreludeSource}) and serve it as the virtual module
 * `brika:embedded-prelude` ({@link embedPrelude}). At runtime the hub
 * materializes that string to `<brikaDir>/runtime/prelude-<hash>.js` and
 * preloads the real file (see `apps/hub/src/runtime/plugins/prelude-locator.ts`).
 *
 * The prelude is bundled BEFORE the main build, not inside the plugin's
 * `onLoad`: a nested `Bun.build` call from within a running build deadlocks
 * on the bundler lock.
 */

const PRELUDE_ENTRY = join(
  import.meta.dir,
  '../../../hub/src/runtime/plugins/prelude/index.ts'
);

/** Bundle the prelude to a single self-contained JS string. */
export async function bundlePreludeSource(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [PRELUDE_ENTRY],
    target: 'bun',
    minify: true,
  });
  const output = result.outputs[0];
  if (!result.success || !output) {
    const messages = result.logs.map((l) => l.message).join('; ');
    throw new Error(`embed-prelude: bundling the prelude failed: ${messages}`);
  }
  return output.text();
}

/** Serve a pre-bundled prelude as the `brika:embedded-prelude` virtual module. */
export function embedPrelude(preludeSource: string): BunPlugin {
  return {
    name: 'embed-prelude',
    setup(build) {
      build.onResolve({ filter: /^brika:embedded-prelude$/ }, (args) => ({
        path: args.path,
        namespace: 'embedded-prelude',
      }));
      build.onLoad({ filter: /.*/, namespace: 'embedded-prelude' }, () => ({
        contents: `export default ${JSON.stringify(preludeSource)};`,
        loader: 'js',
      }));
    },
  };
}
