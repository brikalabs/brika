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
type PreferenceOptionsProvider = () => PreferenceOption[] | Promise<PreferenceOption[]>;

export function setupLifecycle(
  channel: Channel,
  log: (level: LogLevelType, message: string) => void
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

  channel.on(preferencesMsg, ({ values }) => {
    const isFirstTime = Object.keys(preferences).length === 0;
    preferences = values;

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

  channel.implement(preferenceOptionsRpc, async ({ name }) => {
    const provider = prefOptionsProviders.get(name);
    if (!provider) {
      return { options: [] };
    }
    try {
      return { options: await provider() };
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
