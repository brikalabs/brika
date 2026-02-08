/**
 * Tests for the Manifest Loader.
 *
 * Tests loadManifest() which walks up from Bun.main to find the nearest
 * package.json. Requires setting Bun.main and ensuring a test fixture
 * package.json exists on disk.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadManifest } from '../../context/manifest';

// ─── Fixture Setup ───────────────────────────────────────────────────────────

const fixtureDir = '/tmp/brika-test-plugin';
const fixturePackageJson = `${fixtureDir}/package.json`;

// Ensure the test fixture exists
if (!existsSync(fixtureDir)) {
  mkdirSync(fixtureDir, { recursive: true });
}
if (!existsSync(`${fixtureDir}/src`)) {
  mkdirSync(`${fixtureDir}/src`, { recursive: true });
}
if (!existsSync(fixturePackageJson)) {
  writeFileSync(
    fixturePackageJson,
    JSON.stringify({ name: 'test-plugin', version: '1.0.0' }, null, 2)
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('loadManifest', () => {
  const origBunMain = Bun.main;

  beforeEach(() => {
    // Reset Bun.main before each test
    (Bun as { main: string }).main = origBunMain;
  });

  afterEach(() => {
    // Restore Bun.main after each test
    (Bun as { main: string }).main = origBunMain;
  });

  test('finds package.json by walking up from Bun.main', () => {
    // Point Bun.main to a path inside the fixture directory
    (Bun as { main: string }).main = '/tmp/brika-test-plugin/src/index.ts';

    const manifest = loadManifest();

    // Should have found /tmp/brika-test-plugin/package.json
    expect(manifest).toBeDefined();
    expect(manifest.name).toBe('test-plugin');
  });

  test('returns parsed manifest with name and version', () => {
    (Bun as { main: string }).main = '/tmp/brika-test-plugin/src/index.ts';

    const manifest = loadManifest();

    expect(manifest.name).toBe('test-plugin');
    expect(manifest.version).toBe('1.0.0');
  });

  test('throws when no package.json found', () => {
    // Point Bun.main to a nonexistent path where no package.json exists
    (Bun as { main: string }).main = '/nonexistent/path/index.ts';

    expect(() => loadManifest()).toThrow('No package.json found for /nonexistent/path/index.ts');
  });
});
