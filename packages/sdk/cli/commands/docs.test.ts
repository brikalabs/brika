import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import docs from './docs';

let dir: string;
let previousCwd: string;
let previousPort: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'brika-docs-'));
  previousCwd = process.cwd();
  process.chdir(dir);
  // Point the CLI at a dead port so the test never picks up a real local hub.
  previousPort = process.env.BRIKA_PORT;
  process.env.BRIKA_PORT = '1';
  process.exitCode = 0;
});

afterEach(async () => {
  process.chdir(previousCwd);
  if (previousPort === undefined) {
    delete process.env.BRIKA_PORT;
  } else {
    process.env.BRIKA_PORT = previousPort;
  }
  await rm(dir, { recursive: true, force: true });
  process.exitCode = 0;
});

async function run(): Promise<void> {
  await docs.handler({ positionals: [], values: {}, commands: [] });
}

describe('brika docs', () => {
  test('writes BLOCKS.md grouped by category from the manifest', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@acme/demo',
        blocks: [
          { id: 'fetch', name: 'Fetch', description: 'Gets things', category: 'action' },
          { id: 'every-minute', name: 'Every Minute', category: 'trigger' },
        ],
      })
    );

    await run();

    expect(process.exitCode).toBe(0);
    const md = await readFile(join(dir, 'BLOCKS.md'), 'utf8');
    expect(md).toContain('# @acme/demo blocks');
    expect(md).toContain('## Action');
    expect(md).toContain('### Fetch');
    expect(md).toContain('- id: `fetch`');
    expect(md).toContain('- Gets things');
    expect(md).toContain('## Trigger');
    expect(md.indexOf('## Action')).toBeLessThan(md.indexOf('## Trigger'));
  });

  test('errors when no blocks are declared', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@acme/demo' }));

    await run();

    expect(process.exitCode).toBe(1);
  });
});
