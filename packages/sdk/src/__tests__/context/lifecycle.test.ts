/**
 * Tests for the lifecycle context module.
 *
 * Tests setupLifecycle() directly with a mock ContextCore —
 * no mock.module needed.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupLifecycle } from '../../context/lifecycle';
import { createTestHarness } from './_test-utils';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

const h = createTestHarness();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('setupLifecycle', () => {
  let methods: ReturnType<typeof setupLifecycle>['methods'];
  let stop: ReturnType<typeof setupLifecycle>['stop'];

  beforeEach(() => {
    h.reset();
    const result = setupLifecycle(h.core);
    methods = result.methods;
    stop = result.stop;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getPluginUid
  // ─────────────────────────────────────────────────────────────────────────

  describe('getPluginUid', () => {
    test('returns undefined initially', () => {
      expect(methods.getPluginUid()).toBeUndefined();
    });

    test('returns uid after preferences arrive', () => {
      h.onHandlers.get('preferences')!({ values: { __plugin_uid: 'uid-abc-123' } });
      expect(methods.getPluginUid()).toBe('uid-abc-123');
    });

    test('returns undefined when __plugin_uid is not a string', () => {
      h.onHandlers.get('preferences')!({ values: { __plugin_uid: 42 } });
      expect(methods.getPluginUid()).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onInit
  // ─────────────────────────────────────────────────────────────────────────

  describe('onInit', () => {
    test('handler runs on first preferences message', async () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.onInit(handler);

      h.onHandlers.get('preferences')!({ values: { theme: 'dark' } });
      await new Promise((r) => setTimeout(r, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('runs immediately if already initialized', async () => {
      // Trigger first preferences to mark as initialized
      h.onHandlers.get('preferences')!({ values: { a: 1 } });
      await new Promise((r) => setTimeout(r, 10));

      // Now register a handler — should run immediately
      const handler = mock(() => {
        /* noop */
      });
      methods.onInit(handler);
      await new Promise((r) => setTimeout(r, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('unsubscribe works', async () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = methods.onInit(handler);

      expect(typeof unsub).toBe('function');
      unsub();

      // Trigger init — handler should NOT be called since we unsubscribed
      h.onHandlers.get('preferences')!({ values: { x: 1 } });
      await new Promise((r) => setTimeout(r, 10));

      expect(handler).not.toHaveBeenCalled();
    });

    test('handles errors gracefully', async () => {
      const errorHandler = mock(() => {
        throw new Error('init boom');
      });
      methods.onInit(errorHandler);

      // Should not throw
      h.onHandlers.get('preferences')!({ values: { x: 1 } });
      await new Promise((r) => setTimeout(r, 10));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      const errorLog = h.logMessages.find((m) => m.message.includes('Init handler error'));
      expect(errorLog).toBeDefined();
      expect(errorLog!.level).toBe('error');
    });

    test('only runs once', async () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.onInit(handler);

      // First preferences — triggers init
      h.onHandlers.get('preferences')!({ values: { a: 1 } });
      await new Promise((r) => setTimeout(r, 10));

      // Second preferences — should NOT re-trigger init
      h.onHandlers.get('preferences')!({ values: { a: 2 } });
      await new Promise((r) => setTimeout(r, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('handles async errors gracefully when already initialized', async () => {
      // Initialize first
      h.onHandlers.get('preferences')!({ values: { a: 1 } });
      await new Promise((r) => setTimeout(r, 10));

      // Register handler that rejects — caught via Promise.resolve().catch()
      const errorHandler = mock(() => {
        throw new Error('late init boom');
      });
      methods.onInit(errorHandler);
      await new Promise((r) => setTimeout(r, 10));

      const errorLog = h.logMessages.find((m) => m.message.includes('Init handler error'));
      expect(errorLog).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onStop
  // ─────────────────────────────────────────────────────────────────────────

  describe('onStop', () => {
    test('registers handler', () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = methods.onStop(handler);
      expect(typeof unsub).toBe('function');
    });

    test('unsubscribe works', async () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = methods.onStop(handler);

      unsub();

      // Trigger stop — handler should NOT be called
      await stop();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onUninstall
  // ─────────────────────────────────────────────────────────────────────────

  describe('onUninstall', () => {
    test('handler runs on uninstall IPC', async () => {
      const handler = mock(async () => {
        /* noop */
      });
      methods.onUninstall(handler);

      await h.onHandlers.get('uninstall')!({});
      await new Promise((r) => setTimeout(r, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('handles errors gracefully', async () => {
      const errorHandler = mock(() => {
        throw new Error('uninstall boom');
      });
      methods.onUninstall(errorHandler);

      await h.onHandlers.get('uninstall')!({});
      await new Promise((r) => setTimeout(r, 10));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      const errorLog = h.logMessages.find((m) => m.message.includes('Uninstall handler error'));
      expect(errorLog).toBeDefined();
      expect(errorLog!.level).toBe('error');
    });

    test('unsubscribe works', async () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = methods.onUninstall(handler);

      unsub();

      await h.onHandlers.get('uninstall')!({});
      await new Promise((r) => setTimeout(r, 10));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getPreferences
  // ─────────────────────────────────────────────────────────────────────────

  describe('getPreferences', () => {
    test('returns current preferences after IPC message', () => {
      h.onHandlers.get('preferences')!({ values: { theme: 'dark', lang: 'en' } });
      expect(methods.getPreferences()).toEqual({ theme: 'dark', lang: 'en' });
    });

    test('returns empty object before any preferences arrive', () => {
      expect(methods.getPreferences()).toEqual({});
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onPreferencesChange
  // ─────────────────────────────────────────────────────────────────────────

  describe('onPreferencesChange', () => {
    test('notifies on subsequent updates (not first)', async () => {
      const handler = mock((_prefs: Record<string, unknown>) => {
        /* noop */
      });

      // First preferences (triggers init, not change)
      h.onHandlers.get('preferences')!({ values: { a: 1 } });
      await new Promise((r) => setTimeout(r, 10));

      methods.onPreferencesChange(handler);

      // Second preferences (triggers change handlers)
      h.onHandlers.get('preferences')!({ values: { a: 2 } });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ a: 2 });
    });

    test('does not fire on first preferences message', () => {
      const handler = mock((_prefs: Record<string, unknown>) => {
        /* noop */
      });
      methods.onPreferencesChange(handler);

      // First preferences — triggers init path, not change path
      h.onHandlers.get('preferences')!({ values: { a: 1 } });

      expect(handler).not.toHaveBeenCalled();
    });

    test('unsubscribe works', () => {
      const handler = mock((_prefs: Record<string, unknown>) => {
        /* noop */
      });

      // First preferences
      h.onHandlers.get('preferences')!({ values: { a: 1 } });

      const unsub = methods.onPreferencesChange(handler);
      unsub();

      // Second preferences — handler should NOT be called
      h.onHandlers.get('preferences')!({ values: { a: 2 } });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updatePreference
  // ─────────────────────────────────────────────────────────────────────────

  describe('updatePreference', () => {
    test('sends IPC and updates local cache', () => {
      methods.updatePreference('theme', 'light');

      const msg = h.sentMessages.find((m) => m.name === 'updatePreference');
      expect(msg).toBeDefined();
      expect(msg!.payload).toEqual({ key: 'theme', value: 'light' });

      // Local cache should reflect the update
      expect(methods.getPreferences()).toEqual({ theme: 'light' });
    });

    test('merges with existing preferences', () => {
      h.onHandlers.get('preferences')!({ values: { lang: 'en' } });

      methods.updatePreference('theme', 'dark');

      expect(methods.getPreferences()).toEqual({ lang: 'en', theme: 'dark' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // stop()
  // ─────────────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    test('runs all registered stop handlers', async () => {
      const handler1 = mock(() => {
        /* noop */
      });
      const handler2 = mock(() => {
        /* noop */
      });
      methods.onStop(handler1);
      methods.onStop(handler2);

      await stop();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('runs stop handlers in order', async () => {
      const order: number[] = [];
      methods.onStop(() => {
        order.push(1);
      });
      methods.onStop(() => {
        order.push(2);
      });
      methods.onStop(() => {
        order.push(3);
      });

      await stop();

      expect(order).toEqual([1, 2, 3]);
    });

    test('does nothing when no stop handlers registered', async () => {
      // Should not throw
      await stop();
    });
  });
});
