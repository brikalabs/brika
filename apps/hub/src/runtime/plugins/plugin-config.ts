/**
 * Plugin Config Service - Manages plugin preferences with Zod validation.
 */

import { inject, singleton } from '@brika/di';
import type { PreferenceDefinition } from '@brika/plugin';
import { z } from 'zod';
import { ConfigLoader } from '@/runtime/config';
import { StateStore } from '@/runtime/state/state-store';

@singleton()
export class PluginConfigService {
  readonly #configLoader = inject(ConfigLoader);
  readonly #state = inject(StateStore);

  getSchema(pluginName: string): PreferenceDefinition[] {
    const metadata = this.#state.getMetadata(pluginName);
    const prefs: PreferenceDefinition[] | undefined = metadata?.preferences;
    return prefs ?? [];
  }

  getConfig(pluginName: string): Record<string, unknown> {
    const schema = this.getSchema(pluginName);
    const userConfig = this.#configLoader.getPluginConfig(pluginName) ?? {};

    const merged: Record<string, unknown> = {};

    // Include schema-declared preferences (with defaults)
    for (const pref of schema) {
      if (pref.type === 'link') {
        continue;
      }
      merged[pref.name] = pref.name in userConfig ? userConfig[pref.name] : pref.default;
    }

    // Preserve internal SDK keys (e.g. __oauth_*_token) — not in schema but persisted
    for (const key of Object.keys(userConfig)) {
      if (key.startsWith('__')) {
        merged[key] = userConfig[key];
      }
    }

    return merged;
  }

  validate(pluginName: string, config: Record<string, unknown>) {
    const schema = this.getSchema(pluginName);
    return this.#buildZodSchema(schema).safeParse(config);
  }

  async setConfig(pluginName: string, config: Record<string, unknown>) {
    const result = this.validate(pluginName, config);
    if (result.success) {
      await this.#configLoader.setPluginConfig(pluginName, config);
    }
    return result;
  }

  #buildZodSchema(prefs: PreferenceDefinition[]) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const p of prefs) {
      // Link preferences are UI-only (buttons/links) — no value to validate
      if (p.type === 'link') {
        continue;
      }

      const s = this.#zodFieldForPref(p);
      shape[p.name] = p.required ? s : s.optional();
    }
    return z.looseObject(shape);
  }

  #zodFieldForPref(p: PreferenceDefinition): z.ZodTypeAny {
    switch (p.type) {
      case 'text':
      case 'password':
        // Required strings must be non-empty
        return p.required ? z.string().min(1) : z.string();
      case 'number': {
        let num = z.number();
        if (p.min !== undefined) {
          num = num.min(p.min);
        }
        if (p.max !== undefined) {
          num = num.max(p.max);
        }
        return num;
      }
      case 'checkbox':
        return z.boolean();
      case 'dropdown':
        return z.enum(p.options.map((o) => o.value) as [string, ...string[]]);
      case 'dynamic-dropdown':
        return p.required ? z.string().min(1) : z.string();
      default:
        return z.unknown();
    }
  }
}
