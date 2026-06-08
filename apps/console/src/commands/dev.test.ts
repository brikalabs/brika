import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../shared/cli/errors';
import { readPluginName } from './dev';

describe('readPluginName', () => {
  test('returns the package name from a plugin directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brika-dev-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@acme/my-plugin' }));
      expect(await readPluginName(dir)).toBe('@acme/my-plugin');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('throws when the directory has no package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brika-dev-empty-'));
    try {
      await expect(readPluginName(dir)).rejects.toBeInstanceOf(CliError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('throws when package.json has no name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brika-dev-noname-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
      await expect(readPluginName(dir)).rejects.toBeInstanceOf(CliError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
