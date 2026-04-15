/**
 * Lifecycle Module
 *
 * Thin typed wrapper over the prelude's lifecycle handlers.
 * All IPC logic lives in the prelude; the SDK only provides type safety
 * and the module registration glue.
 *
 * Self-registers with the context module system.
 */

import type { PreferenceOption } from '../bridge';
import { type ContextCore, registerContextModule, requireBridge } from './register';

export type { PreferenceOption } from '../bridge';

// ─── Types ────────────────────────────────────────────────────────────────────

type InitHandler = () => void | Promise<void>;
type StopHandler = () => void | Promise<void>;
type UninstallHandler = () => void | Promise<void>;
type PreferencesChangeHandler = (preferences: Record<string, unknown>) => void;
type PreferenceOptionsProvider = () => PreferenceOption[] | Promise<PreferenceOption[]>;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupLifecycle(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      getPluginUid(): string | undefined {
        return bridge.getPluginUid();
      },

      onInit(fn: InitHandler): () => void {
        return bridge.onInit(fn);
      },

      onStop(fn: StopHandler): () => void {
        return bridge.onStop(fn);
      },

      onUninstall(fn: UninstallHandler): () => void {
        return bridge.onUninstall(fn);
      },

      getPreferences<T extends Record<string, unknown> = Record<string, unknown>>(): T {
        return bridge.getPreferences() as T;
      },

      onPreferencesChange(handler: PreferencesChangeHandler): () => void {
        return bridge.onPreferencesChange(handler);
      },

      updatePreference(key: string, value: unknown): void {
        bridge.updatePreference(key, value);
      },

      definePreferenceOptions(name: string, provider: PreferenceOptionsProvider): void {
        bridge.definePreferenceOptions(name, provider);
      },
    },
  };
}

registerContextModule('lifecycle', setupLifecycle);
