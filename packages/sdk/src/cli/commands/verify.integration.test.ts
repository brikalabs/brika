/**
 * Integration test for `brika verify` — spawns the CLI against temp plugin dirs.
 * The validation core (verifyPlugin) is unit-tested in @brika/sdk; this covers
 * the command wiring: exit codes, human output, and --json.
 */

import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAIN = join(import.meta.dir, '..', 'brika.ts');
const SDK_VERSION = (
  (await Bun.file(Bun.resolveSync('@brika/sdk/package.json', import.meta.dir)).json()) as {
    version: string;
  }
).version;

function validPlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'my-plugin',
    version: '1.0.0',
    main: './src/index.ts',
    engines: { brika: `^${SDK_VERSION}` },
    $schema: 'https://schema.brika.dev/plugin.schema.json',
    keywords: ['brika', 'brika-plugin'],
    ...overrides,
  };
}

async function runVerify(
  pkg: Record<string, unknown> | null,
  extraArgs: string[] = []
): Promise<{ exitCode: number; stdout: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'brika-verify-cli-'));
  try {
    if (pkg) {
      await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
      if (typeof pkg.main === 'string') {
        await mkdir(join(dir, 'src'), { recursive: true });
        await writeFile(join(dir, pkg.main), 'export {};');
      }
    }
    const proc = Bun.spawn(['bun', MAIN, 'verify', '--dir', dir, ...extraArgs], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { exitCode, stdout };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('brika verify', () => {
  test('passes a valid plugin (exit 0, all checks)', async () => {
    const { exitCode, stdout } = await runVerify(validPlugin());
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Verification passed');
    expect(stdout).toContain('schema validation passed');
    expect(stdout).toContain('engines.brika');
  });

  test('fails when engines.brika does not cover the SDK (exit 1)', async () => {
    const { exitCode, stdout } = await runVerify(validPlugin({ engines: { brika: '^0.0.1' } }));
    expect(exitCode).toBe(1);
    expect(stdout).toContain('does not cover current SDK version');
  });

  test('fails when keywords omit "brika" (exit 1)', async () => {
    const { exitCode, stdout } = await runVerify(validPlugin({ keywords: ['plugin'] }));
    expect(exitCode).toBe(1);
    expect(stdout).toContain('keywords must include "brika"');
  });

  test('--json emits the result shape with passed + sdkVersion', async () => {
    const { exitCode, stdout } = await runVerify(validPlugin(), ['--json']);
    const payload = JSON.parse(stdout.trim());
    expect(exitCode).toBe(0);
    expect(payload.passed).toBe(true);
    expect(payload.sdkVersion).toBe(SDK_VERSION);
    expect(payload.name).toBe('my-plugin');
  });

  test('exits 1 when the directory has no package.json', async () => {
    const { exitCode } = await runVerify(null);
    expect(exitCode).toBe(1);
  });
});
