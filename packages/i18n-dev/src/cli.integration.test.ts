import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, 'cli.ts');

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

describe('brika-i18n CLI', () => {
  test('prints help for the `help` subcommand', async () => {
    const result = await runCli(['help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('brika-i18n');
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('types');
    expect(result.stdout).toContain('check');
  });

  test('prints help for --help flag', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('brika-i18n');
  });

  test('prints help for -h short flag', async () => {
    const result = await runCli(['-h']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('brika-i18n');
  });

  test('prints help when no subcommand is supplied (defaults to help)', async () => {
    const result = await runCli([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Commands:');
  });

  test('exits non-zero on an unknown subcommand and emits a helpful error', async () => {
    const result = await runCli(['nonsense']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unknown subcommand: nonsense');
    // Help is also printed on stdout after the error
    expect(result.stdout).toContain('brika-i18n');
  });
});
