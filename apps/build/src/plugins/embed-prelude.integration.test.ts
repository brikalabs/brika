/**
 * Real `Bun.build` runs: the prelude must bundle to a self-contained string,
 * and an entry importing the `brika:embedded-prelude` virtual module must
 * receive it, exactly as compile.ts / bundle.ts wire production artifacts.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embedPrelude } from './embed-prelude';

describe('embedPrelude', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-embed-prelude-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('bundlePreludeSource produces standalone JS that parses', async () => {
    // Bundle in a subprocess: `Bun.build` under the `bun test` runner fails to
    // resolve workspace deps, while the real build CLI (a plain bun process,
    // which this mirrors) resolves them fine.
    const preludeOut = join(tmpDir, 'prelude.js');
    const script =
      `import { bundlePreludeSource } from ${JSON.stringify(join(import.meta.dir, 'embed-prelude.ts'))};\n` +
      `await Bun.write(${JSON.stringify(preludeOut)}, await bundlePreludeSource());\n`;
    const bundler = Bun.spawn(['bun', '-e', script], { stderr: 'inherit' });
    expect(await bundler.exited).toBe(0);

    const source = await Bun.file(preludeOut).text();
    // The prelude announces itself to the SDK via this global brand.
    expect(source).toContain('__brika_ipc');

    const check = Bun.spawn(['bun', 'build', '--no-bundle', preludeOut], {
      stdout: 'ignore',
      stderr: 'pipe',
    });
    expect(await check.exited).toBe(0);
  });

  test('an entry importing brika:embedded-prelude bundles with the embedded source', async () => {
    const entry = join(tmpDir, 'entry.ts');
    await writeFile(
      entry,
      "import source from 'brika:embedded-prelude';\nconsole.log(typeof source, source.length);\n"
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: 'bun',
      plugins: [embedPrelude('globalThis.__test_embedded_prelude = 1;')],
    });
    expect(result.success).toBe(true);

    const code = await result.outputs[0]?.text();
    expect(code).toContain('__test_embedded_prelude');
  });
});
