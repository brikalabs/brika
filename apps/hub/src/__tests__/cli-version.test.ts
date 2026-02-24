/**
 * Tests for the version CLI command
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cli } from '@/cli/commands';

describe('cli/commands/version', () => {
  const version = cli.get('version');

  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: unknown[]) => output.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  test('is registered', () => {
    expect(version).toBeDefined();
    expect(version?.name).toBe('version');
  });

  test('has -v and --version aliases', () => {
    expect(version?.aliases).toContain('-v');
    expect(version?.aliases).toContain('--version');
    expect(cli.get('-v')?.name).toBe('version');
    expect(cli.get('--version')?.name).toBe('version');
  });

  test('outputs platform info', () => {
    version?.handler({ values: {}, positionals: [], commands: [] });

    const joined = output.join('\n');
    expect(joined).toContain('Platform:');
    expect(joined).toContain(`${process.platform}/${process.arch}`);
  });

  test('outputs runtime info', () => {
    version?.handler({ values: {}, positionals: [], commands: [] });

    const joined = output.join('\n');
    expect(joined).toContain('Runtime:');
    expect(joined).toContain(`Bun ${Bun.version}`);
  });

  test('outputs install directory', () => {
    version?.handler({ values: {}, positionals: [], commands: [] });

    const joined = output.join('\n');
    expect(joined).toContain('Install:');
  });

  test('--json outputs valid JSON with required fields', () => {
    version?.handler({ values: { json: true }, positionals: [], commands: [] });

    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0] ?? '{}');
    expect(parsed).toMatchObject({
      version: expect.any(String),
      commit: expect.any(String),
      platform: `${process.platform}/${process.arch}`,
      runtime: Bun.version,
      date: expect.any(String),
    });
  });

  test('--json output does not contain color codes', () => {
    version?.handler({ values: { json: true }, positionals: [], commands: [] });

    expect(output[0]).not.toContain('\u001b[');
  });
});
