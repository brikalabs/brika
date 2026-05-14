/**
 * Smoke tests for the `mortar` binary entry point.
 *
 * These run the real CLI as a subprocess so we exercise the
 * `createCli().run()` wire-up — anything else mocks too much of what
 * we actually ship. Tests are fast (each spawn is ~150ms on a warm
 * machine) and don't need a TTY because we never reach the TUI path.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('./cli.ts', import.meta.url).pathname;

async function runCli(
  args: readonly string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, exitCode: proc.exitCode ?? -1 };
}

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mortar-cli-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('mortar CLI', () => {
  test('--help renders the global command list', async () => {
    const { stdout, exitCode } = await runCli(['--help'], workDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('mortar');
    expect(stdout).toContain('start');
    expect(stdout).toContain('init');
    expect(stdout).toContain('help');
  });

  test('help start renders per-command flags', async () => {
    const { stdout, exitCode } = await runCli(['help', 'start'], workDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--no-tui');
    expect(stdout).toContain('--config');
  });

  test('init writes mortar.yml in cwd and round-trips', async () => {
    const { stdout, exitCode } = await runCli(['init'], workDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('mortar.yml');
    const path = join(workDir, 'mortar.yml');
    const text = await readFile(path, 'utf8');
    expect(text).toContain('services:');
    expect(text).toContain('label:');
    expect(text).toContain('command:');
  });

  test('start with --config pointing at a missing file errors out', async () => {
    const { stderr, exitCode } = await runCli(
      ['start', '--config', join(workDir, 'nope.yml')],
      workDir
    );
    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/no mortar\.yml found|enoent/i);
  });

  test('unknown command surfaces a friendly CLI error', async () => {
    const { stderr, exitCode } = await runCli(['nonsense'], workDir);
    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toContain('unknown command');
  });
});
