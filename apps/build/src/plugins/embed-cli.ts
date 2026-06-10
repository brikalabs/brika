import { join } from 'node:path';
import type { BunPlugin } from 'bun';

/**
 * Embed the author CLI into production builds.
 *
 * `brika build` / `brika dev` generate the plugin manifest by importing the
 * plugin's source modules in-process. A compiled binary cannot do that: Bun's
 * standalone runtime loader does not resolve bare specifiers (`@brika/sdk`)
 * from disk files imported at runtime, so every plugin module failed with
 * `Cannot find module '@brika/sdk'`. Only the bundler resolver works there.
 *
 * Fix: bundle the author CLI (`packages/sdk/src/cli/brika.ts`, the same entry
 * the lean `@brika/sdk` bin uses) into one self-contained JS string and serve
 * it as the virtual module `brika:embedded-cli`. At runtime a compiled binary
 * materializes it and re-runs the build in a plain-bun child, where plugin
 * imports resolve normally (see `packages/sdk/src/cli/embedded-cli.ts`).
 *
 * Unlike the lean bin, `@brika/sdk` is inlined here: the materialized file
 * lives under `<dataDir>/runtime/` with no node_modules to resolve from. The
 * plugin's own modules still load their own `@brika/sdk` copy; the build
 * collector tolerates that (its sink lives on `globalThis`).
 *
 * Bundled BEFORE the main build for the same reason as the prelude: a nested
 * `Bun.build` inside `onLoad` deadlocks on the bundler lock.
 */

const CLI_ENTRY = join(import.meta.dir, '../../../../packages/sdk/src/cli/brika.ts');

/** Bundle the author CLI to a single self-contained JS string. */
export async function bundleCliSource(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [CLI_ENTRY],
    target: 'bun',
    minify: true,
    // The CLI's own compiled-mode delegation import; never executed when the
    // materialized file runs under plain bun.
    external: ['brika:embedded-cli'],
  });
  const output = result.outputs[0];
  if (!result.success || !output) {
    const messages = result.logs.map((l) => l.message).join('; ');
    throw new Error(`embed-cli: bundling the author CLI failed: ${messages}`);
  }
  return output.text();
}

/** Serve a pre-bundled author CLI as the `brika:embedded-cli` virtual module. */
export function embedCli(cliSource: string): BunPlugin {
  return {
    name: 'embed-cli',
    setup(build) {
      build.onResolve({ filter: /^brika:embedded-cli$/ }, (args) => ({
        path: args.path,
        namespace: 'embedded-cli',
      }));
      build.onLoad({ filter: /.*/, namespace: 'embedded-cli' }, () => ({
        contents: `export default ${JSON.stringify(cliSource)};`,
        loader: 'js',
      }));
    },
  };
}
