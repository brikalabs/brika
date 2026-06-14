import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import create from './create';

let dir: string;
let previousCwd: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'brika-create-'));
  previousCwd = process.cwd();
  process.chdir(dir);
  process.exitCode = 0;
});

afterEach(async () => {
  process.chdir(previousCwd);
  await rm(dir, { recursive: true, force: true });
  process.exitCode = 0;
});

async function run(positionals: string[]): Promise<void> {
  await create.handler({ positionals, values: {}, commands: [] });
}

describe('brika create block', () => {
  test('scaffolds the block, its test, and the manifest entry', async () => {
    await writeFile(
      join(dir, 'package.json'),
      `${JSON.stringify({ name: '@acme/demo', blocks: [] }, null, 2)}\n`
    );

    await run(['block', 'fetch-weather']);

    expect(process.exitCode).toBe(0);
    const block = await readFile(join(dir, 'src', 'blocks', 'fetch-weather.ts'), 'utf8');
    expect(block).toContain("id: 'fetch-weather'");
    expect(block).toContain('export const fetchWeatherBlock = defineBlock({');

    const testFile = await readFile(join(dir, 'src', 'blocks', 'fetch-weather.test.ts'), 'utf8');
    expect(testFile).toContain('runBlock(fetchWeatherBlock)');

    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    expect(manifest.blocks).toEqual([
      expect.objectContaining({ id: 'fetch-weather', name: 'Fetch Weather', category: 'action' }),
    ]);
  });

  test('rejects an id that is already declared', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/demo', blocks: [{ id: 'dup', name: 'Dup' }] })
    );

    await run(['block', 'dup']);

    expect(process.exitCode).toBe(1);
  });

  test('rejects a non-kebab-case id', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@acme/demo' }));

    await run(['block', 'NotKebab']);

    expect(process.exitCode).toBe(1);
  });

  test('rejects unknown subjects', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@acme/demo' }));

    await run(['gadget', 'x']);

    expect(process.exitCode).toBe(1);
  });
});
