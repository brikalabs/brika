/**
 * Tests for the version CLI command
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { commandMap } from '@/cli/commands';

describe('cli/commands/version', () => {
  const version = commandMap.get('version');

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
    expect(commandMap.get('-v')?.name).toBe('version');
    expect(commandMap.get('--version')?.name).toBe('version');
  });

  test('outputs platform info', () => {
    version?.handler({ values: {}, positionals: [] });

    const joined = output.join('\n');
    expect(joined).toContain('Platform:');
    expect(joined).toContain(`${process.platform}/${process.arch}`);
  });

  test('outputs runtime info', () => {
    version?.handler({ values: {}, positionals: [] });

    const joined = output.join('\n');
    expect(joined).toContain('Runtime:');
    expect(joined).toContain(`Bun ${Bun.version}`);
  });

  test('outputs install directory', () => {
    version?.handler({ values: {}, positionals: [] });

    const joined = output.join('\n');
    expect(joined).toContain('Install:');
  });
});
