/**
 * Test for BrikaInitializer
 * Verifies that the simplified initializer correctly creates the .brika directory structure
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BrikaInitializer } from '@/runtime/config/brika-initializer';

const TEST_DIR = join(import.meta.dir, '.test-brika-init');

describe('BrikaInitializer', () => {
  let originalCwd: string;

  beforeAll(async () => {
    // Save original directory and create test directory
    originalCwd = process.cwd();
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterAll(async () => {
    // Restore original directory and cleanup
    process.chdir(originalCwd);
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('creates .brika directory in current working directory', async () => {
    const initializer = new BrikaInitializer();

    expect(initializer.rootDir).toBe(TEST_DIR);
    expect(initializer.brikaDir).toBe(join(TEST_DIR, '.brika'));

    await initializer.init();

    // Check .brika directory exists
    const brikaDir = join(TEST_DIR, '.brika');
    const files = await readdir(brikaDir);

    expect(files).toContain('brika.yml');
    expect(files).toContain('automations');
  });

  test('creates default brika.yml with correct content', async () => {
    const initializer = new BrikaInitializer();
    await initializer.init();

    const configPath = join(TEST_DIR, '.brika', 'brika.yml');
    const configFile = Bun.file(configPath);
    const content = await configFile.text();

    // Check for key configuration sections
    expect(content).toContain('hub:');
    expect(content).toContain('port: 3001');
    expect(content).toContain('plugins:');
    expect(content).toContain('install:');
    expect(content).toContain('rules: []');
    expect(content).toContain('schedules: []');
  });

  test('does not overwrite existing brika.yml', async () => {
    const initializer = new BrikaInitializer();
    await initializer.init();

    const configPath = join(TEST_DIR, '.brika', 'brika.yml');
    const customContent = '# Custom config\nhub:\n  port: 9999\n';
    await Bun.write(configPath, customContent);

    // Run init again
    await initializer.init();

    // Config should not be overwritten
    const configFile = Bun.file(configPath);
    const content = await configFile.text();
    expect(content).toBe(customContent);
  });

  test('creates automations subdirectory', async () => {
    const initializer = new BrikaInitializer();
    await initializer.init();

    const automationsDir = join(TEST_DIR, '.brika', 'automations');

    // Directory should exist (checking if we can list it)
    const files = await readdir(automationsDir);
    expect(Array.isArray(files)).toBe(true);
  });

  test('removes deprecated directories', async () => {
    const initializer = new BrikaInitializer();

    // Create deprecated directory
    const deprecatedDir = join(TEST_DIR, '.brika', 'plugins-node');
    await mkdir(deprecatedDir, { recursive: true });
    await Bun.write(join(deprecatedDir, 'test.txt'), 'test');

    await initializer.init();

    // Deprecated directory should be removed
    const exists = await Bun.file(deprecatedDir).exists();
    expect(exists).toBe(false);
  });
});
