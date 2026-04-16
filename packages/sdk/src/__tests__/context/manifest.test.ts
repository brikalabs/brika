/**
 * Tests for the Manifest Loader.
 *
 * Manifest loading now lives in the prelude. These tests verify
 * that the SDK functions correctly delegate to the bridge.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { getPluginRootDirectory, loadManifest } from '../../context/manifest';
import { createTestHarness } from './_test-utils';

const h = createTestHarness({
  name: 'my-plugin',
  version: '2.0.0',
});

describe('loadManifest', () => {
  beforeEach(() => {
    h.reset();
  });

  test('delegates to bridge.getManifest', () => {
    const manifest = loadManifest();
    expect(h.bridge.getManifest).toHaveBeenCalled();
    expect(manifest.name).toBe('my-plugin');
    expect(manifest.version).toBe('2.0.0');
  });
});

describe('getPluginRootDirectory', () => {
  beforeEach(() => {
    h.reset();
  });

  test('delegates to bridge.getPluginRootDirectory', () => {
    const root = getPluginRootDirectory();
    expect(h.bridge.getPluginRootDirectory).toHaveBeenCalled();
    expect(root).toBe('/test/plugin');
  });
});
