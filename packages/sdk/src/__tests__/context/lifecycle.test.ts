/**
 * Tests for the lifecycle context module.
 *
 * All lifecycle logic now lives in the prelude. These tests verify
 * that the SDK module correctly delegates to the bridge.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupLifecycle } from '../../context/lifecycle';
import { createTestHarness } from './_test-utils';

const h = createTestHarness();

describe('setupLifecycle', () => {
  let methods: ReturnType<typeof setupLifecycle>['methods'];

  beforeEach(() => {
    h.reset();
    const result = setupLifecycle(h.core);
    methods = result.methods;
  });

  describe('getPluginUid', () => {
    test('delegates to bridge.getPluginUid', () => {
      h.bridge.getPluginUid.mockReturnValue('uid-abc-123');
      expect(methods.getPluginUid()).toBe('uid-abc-123');
    });

    test('returns undefined when bridge returns undefined', () => {
      h.bridge.getPluginUid.mockReturnValue(undefined);
      expect(methods.getPluginUid()).toBeUndefined();
    });
  });

  describe('onInit', () => {
    test('delegates to bridge.onInit', () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.onInit(handler);
      expect(h.bridge.onInit).toHaveBeenCalledWith(handler);
    });

    test('returns unsubscribe from bridge', () => {
      const unsub = mock(() => {
        /* noop */
      });
      h.bridge.onInit.mockReturnValue(unsub);

      const result = methods.onInit(() => {
        /* noop */
      });
      expect(result).toBe(unsub);
    });
  });

  describe('onStop', () => {
    test('delegates to bridge.onStop', () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.onStop(handler);
      expect(h.bridge.onStop).toHaveBeenCalledWith(handler);
    });

    test('returns unsubscribe from bridge', () => {
      const unsub = mock(() => {
        /* noop */
      });
      h.bridge.onStop.mockReturnValue(unsub);

      const result = methods.onStop(() => {
        /* noop */
      });
      expect(result).toBe(unsub);
    });
  });

  describe('onUninstall', () => {
    test('delegates to bridge.onUninstall', () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.onUninstall(handler);
      expect(h.bridge.onUninstall).toHaveBeenCalledWith(handler);
    });
  });

  describe('getPreferences', () => {
    test('delegates to bridge.getPreferences', () => {
      const prefs = { theme: 'dark', lang: 'en' };
      h.bridge.getPreferences.mockReturnValue(prefs);
      expect(methods.getPreferences()).toBe(prefs);
    });
  });

  describe('onPreferencesChange', () => {
    test('delegates to bridge.onPreferencesChange', () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.onPreferencesChange(handler);
      expect(h.bridge.onPreferencesChange).toHaveBeenCalledWith(handler);
    });
  });

  describe('updatePreference', () => {
    test('delegates to bridge.updatePreference', () => {
      methods.updatePreference('theme', 'light');
      expect(h.bridge.updatePreference).toHaveBeenCalledWith('theme', 'light');
    });
  });

  describe('definePreferenceOptions', () => {
    test('delegates to bridge.definePreferenceOptions', () => {
      const provider = async () => [{ value: 'a', label: 'A' }];
      methods.definePreferenceOptions('color', provider);
      expect(h.bridge.definePreferenceOptions).toHaveBeenCalledWith('color', provider);
    });
  });
});
