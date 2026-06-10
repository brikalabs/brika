/**
 * Real `Bun.build` runs: the author CLI must bundle to a self-contained string
 * (with the compiled-mode delegation import left external and dormant), and an
 * entry importing `brika:embedded-cli` must receive it, exactly as compile.ts /
 * bundle.ts wire production artifacts.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embedCli } from './embed-cli';

describe('embedCli', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-embed-cli-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('bundleCliSource produces standalone JS that parses', async () => {
    // Bundle in a subprocess: `Bun.build` under the `bun test` runner fails to
    // resolve workspace deps, while the real build CLI (a plain bun process,
    // which this mirrors) resolves them fine.
    const cliOut = join(tmpDir, 'brika-cli.js');
    const script =
      `import { bundleCliSource } from ${JSON.stringify(join(import.meta.dir, 'embed-cli.ts'))};\n` +
      `await Bun.write(${JSON.stringify(cliOut)}, await bundleCliSource());\n`;
    const bundler = Bun.spawn(['bun', '-e', script], { stderr: 'inherit' });
    expect(await bundler.exited).toBe(0);

    const source = await Bun.file(cliOut).text();
    // The delegation import survives as a dormant external.
    expect(source).toContain('brika:embedded-cli');

    const check = Bun.spawn(['bun', 'build', '--no-bundle', cliOut], {
      stdout: 'ignore',
      stderr: 'pipe',
    });
    expect(await check.exited).toBe(0);
  });

  test('an entry importing brika:embedded-cli bundles with the embedded source', async () => {
    const entry = join(tmpDir, 'entry.ts');
    await writeFile(
      entry,
      "import source from 'brika:embedded-cli';\nconsole.log(typeof source, source.length);\n"
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: 'bun',
      plugins: [embedCli('globalThis.__test_embedded_cli = 1;')],
    });
    expect(result.success).toBe(true);

    const code = await result.outputs[0]?.text();
    expect(code).toContain('__test_embedded_cli');
  });
});
