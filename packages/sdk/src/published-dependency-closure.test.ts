import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Guards @brika/sdk's published dependency layout.
 *
 * The SDK ships raw `.ts` (its `exports` point at `./src/*.ts`), so the package
 * manager must resolve the plugin-facing runtime closure from npm. If a closure
 * package sits in `devDependencies`, an npm-installed plugin crashes on first
 * load (value import) or fails to typecheck (type import).
 *
 * RUNTIME_CLOSURE: @brika/* reached from the plugin-facing exports (the `.`
 * entry + blocks/grants/ctx/ui-kit/i18n surface). MUST be `dependencies`.
 * Verified value imports: @brika/flow (src/index.ts `export *`,
 * src/blocks/reactive.ts), @brika/ui-kit (src/context/i18n.ts). Type imports:
 * @brika/serializable (src/blocks/types.ts, src/blocks/reactive-define.ts).
 *
 * BUNDLED_OR_DEV: the `brika` author CLI (@brika/cli, @brika/compiler,
 * @brika/schema) is inlined into `dist/bin/brika.js` by `build:bin`, and
 * @brika/testing backs the dev-only `./testing` export. These MUST stay
 * `devDependencies`: promoting them would force publishing private packages
 * (a forbidden public->private dependency). See docs/npm-publishing-strategy.md.
 */

const RUNTIME_CLOSURE = [
  '@brika/errors',
  '@brika/flow',
  '@brika/grants',
  '@brika/ipc',
  '@brika/serializable',
  '@brika/ui-kit',
];

const BUNDLED_OR_DEV = ['@brika/cli', '@brika/compiler', '@brika/schema', '@brika/testing'];

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

const manifest = manifestSchema.parse(
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'))
);

describe('@brika/sdk published dependency closure', () => {
  test.each(RUNTIME_CLOSURE)('%s is a runtime dependency, not a devDependency', (name) => {
    expect(manifest.dependencies[name]).toBeDefined();
    expect(manifest.devDependencies[name]).toBeUndefined();
  });

  test.each(
    BUNDLED_OR_DEV
  )('%s stays a devDependency (bundled into the bin or dev-only)', (name) => {
    expect(manifest.devDependencies[name]).toBeDefined();
    expect(manifest.dependencies[name]).toBeUndefined();
  });
});
