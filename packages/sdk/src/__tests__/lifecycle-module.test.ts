/**
 * Tests for SDK lifecycle module (asset function)
 */
import { afterEach, describe, expect, test } from 'bun:test';

const { asset } = await import('../lifecycle');

describe('asset', () => {
  const originalEnv = process.env.BRIKA_PLUGIN_UID;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BRIKA_PLUGIN_UID;
    } else {
      process.env.BRIKA_PLUGIN_UID = originalEnv;
    }
  });

  test('returns correct asset URL when BRIKA_PLUGIN_UID is set', () => {
    process.env.BRIKA_PLUGIN_UID = 'my-plugin';
    const url = asset('banner.png');
    expect(url).toBe('/api/plugins/my-plugin/assets/banner.png');
  });

  test('handles nested paths', () => {
    process.env.BRIKA_PLUGIN_UID = 'timer';
    const url = asset('images/icon.svg');
    expect(url).toBe('/api/plugins/timer/assets/images/icon.svg');
  });

  test('throws when BRIKA_PLUGIN_UID is not set', () => {
    delete process.env.BRIKA_PLUGIN_UID;
    expect(() => asset('test.png')).toThrow('asset() can only be called from a plugin process');
  });
});
