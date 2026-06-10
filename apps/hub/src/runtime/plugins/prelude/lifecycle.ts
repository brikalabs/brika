/**
 * Prelude Lifecycle Module
 *
 * Handles preferences state machine, init/uninstall handlers,
 * and dynamic preference options provider.
 */

import type { Channel } from '@brika/ipc';
import type { LogLevelType } from '@brika/ipc/contract';

interface PreferenceOption {
  value: string;
  label: string;
  description?: string;
}

import {
  preferenceOptions as preferenceOptionsRpc,
  preferences as preferencesMsg,
  uninstall as uninstallMsg,
  updatePreference as updatePreferenceMsg,
} from '@brika/ipc/contract';

type InitHandler = () => void | Promise<void>;
type UninstallHandler = () => void | Promise<void>;
type PreferencesChangeHandler = (preferences: Record<string, unknown>) => void;
type PreferenceOptionsProvider = (
  params?: Record<string, unknown>
) => PreferenceOption[] | Promise<PreferenceOption[]>;

export function setupLifecycle(
  channel: Channel,
  log: (level: LogLevelType, message: string) => void,
  /**
   * Resolves once the grant vector + net proxies are installed. The
   * preferences handler awaits this before firing onInit / onPreferencesChange
   * so a plugin that calls fetch from one of those handlers does not hit the
   * scrubbed deny-stub during the startup window. See prelude/index.ts.
   */
  vectorReady: Promise<void>
) {
  const initHandlers = new Set<InitHandler>();
  const uninstallHandlers = new Set<UninstallHandler>();
  const preferencesChangeHandlers = new Set<PreferencesChangeHandler>();
  const prefOptionsProviders = new Map<string, PreferenceOptionsProvider>();
  let preferences: Record<string, unknown> = {};
  let initialized = false;

  async function runInitHandlers(): Promise<void> {
    if (initialized) {
      return;
    }
    initialized = true;
    for (const h of initHandlers) {
      try {
        await h();
      } catch (e) {
        log('error', `Init handler error: ${e}`);
      }
    }
  }

  channel.on(preferencesMsg, async ({ values }) => {
    const isFirstTime = Object.keys(preferences).length === 0;
    preferences = values;

    // Defer onInit / onPreferencesChange until the grant vector is live, so a
    // plugin that calls fetch from one of those handlers sees the real proxy
    // rather than the lockdown deny-stub. State (`preferences`) is updated
    // synchronously above so `getPreferences()` is correct immediately.
    await vectorReady;

    if (isFirstTime) {
      runInitHandlers();
    } else {
      for (const handler of preferencesChangeHandlers) {
        handler(preferences);
      }
    }
  });

  channel.on(uninstallMsg, async () => {
    for (const h of uninstallHandlers) {
      try {
        await h();
      } catch (e) {
        log('error', `Uninstall handler error: ${e}`);
      }
    }
  });

  channel.implement(preferenceOptionsRpc, async ({ name, params }) => {
    const provider = prefOptionsProviders.get(name);
    if (!provider) {
      return { options: [] };
    }
    try {
      return { options: await provider(params) };
    } catch (e) {
      log('error', `Preference options provider error for "${name}": ${e}`);
      return { options: [] };
    }
  });

  return {
    onInit(fn: InitHandler): () => void {
      if (initialized) {
        Promise.resolve()
          .then(() => fn())
          .catch((e) => log('error', `Init handler error: ${e}`));
        return () => {
          /* already ran */
        };
      }
      initHandlers.add(fn);
      return () => {
        initHandlers.delete(fn);
      };
    },

    onUninstall(fn: UninstallHandler): () => void {
      uninstallHandlers.add(fn);
      return () => {
        uninstallHandlers.delete(fn);
      };
    },

    getPreferences(): Record<string, unknown> {
      return preferences;
    },

    onPreferencesChange(handler: PreferencesChangeHandler): () => void {
      preferencesChangeHandlers.add(handler);
      return () => {
        preferencesChangeHandlers.delete(handler);
      };
    },

    updatePreference(key: string, value: unknown): void {
      preferences[key] = value;
      channel.send(updatePreferenceMsg, { key, value });
    },

    definePreferenceOptions(name: string, provider: PreferenceOptionsProvider): void {
      prefOptionsProviders.set(name, provider);
    },
  };
}
