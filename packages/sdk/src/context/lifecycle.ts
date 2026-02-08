/**
 * Lifecycle Module
 *
 * Handles plugin init/stop/uninstall lifecycle, preferences management,
 * and plugin UID.
 * Self-registers with the context module system.
 */

import {
  preferences as preferencesMsg,
  uninstall as uninstallMsg,
  updatePreference as updatePreferenceMsg,
} from '@brika/ipc/contract';
import { type ContextCore, type MethodsOf, registerContextModule } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

type InitHandler = () => void | Promise<void>;
type StopHandler = () => void | Promise<void>;
type UninstallHandler = () => void | Promise<void>;
type PreferencesChangeHandler = (preferences: Record<string, unknown>) => void;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupLifecycle(core: ContextCore) {
  const { client } = core;
  const initHandlers = new Set<InitHandler>();
  const stopHandlers = new Set<StopHandler>();
  const uninstallHandlers = new Set<UninstallHandler>();
  const preferencesChangeHandlers = new Set<PreferencesChangeHandler>();
  let preferences: Record<string, unknown> = {};
  let initialized = false;

  async function runInitHandlers(): Promise<void> {
    if (initialized) return;
    initialized = true;
    for (const h of initHandlers) {
      try {
        await h();
      } catch (e) {
        core.log('error', `Init handler error: ${e}`);
      }
    }
  }

  client.on(preferencesMsg, ({ values }) => {
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

  client.on(uninstallMsg, async () => {
    for (const h of uninstallHandlers) {
      try {
        await h();
      } catch (e) {
        core.log('error', `Uninstall handler error: ${e}`);
      }
    }
  });

  return {
    methods: {
      getPluginUid(): string | undefined {
        const uid = preferences.__plugin_uid;
        return typeof uid === 'string' ? uid : undefined;
      },

      onInit(fn: InitHandler): () => void {
        if (initialized) {
          Promise.resolve()
            .then(() => fn())
            .catch((e) => core.log('error', `Init handler error: ${e}`));
          return () => {
            /* no-op */
          };
        }
        initHandlers.add(fn);
        return () => initHandlers.delete(fn);
      },

      onStop(fn: StopHandler): () => void {
        stopHandlers.add(fn);
        return () => stopHandlers.delete(fn);
      },

      onUninstall(fn: UninstallHandler): () => void {
        uninstallHandlers.add(fn);
        return () => uninstallHandlers.delete(fn);
      },

      getPreferences<T extends Record<string, unknown> = Record<string, unknown>>(): T {
        return preferences as T;
      },

      onPreferencesChange(handler: PreferencesChangeHandler): () => void {
        preferencesChangeHandlers.add(handler);
        return () => preferencesChangeHandlers.delete(handler);
      },

      updatePreference(key: string, value: unknown): void {
        preferences[key] = value;
        client.send(updatePreferenceMsg, { key, value });
      },
    },

    async stop() {
      for (const h of stopHandlers) await h();
    },
  };
}

// ─── Type Augmentation (inferred from setup) ─────────────────────────────────

declare module '../context' {
  interface Context extends MethodsOf<typeof setupLifecycle> {}
}

registerContextModule('lifecycle', setupLifecycle);
