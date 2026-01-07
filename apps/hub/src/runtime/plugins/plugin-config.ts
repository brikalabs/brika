/**
 * Plugin Config Service - Manages plugin preferences with Zod validation.
 */

import type { PreferenceDefinition } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { z } from 'zod';
import { ConfigLoader } from '@/runtime/config';
import { StateStore } from '@/runtime/state/state-store';

@singleton()
export class PluginConfigService {
  readonly #configLoader = inject(ConfigLoader);
  readonly #state = inject(StateStore);

  getSchema(pluginName: string): PreferenceDefinition[] {
    const metadata = this.#state.getMetadata(pluginName);
    return (metadata?.preferences as PreferenceDefinition[] | undefined) ?? [];
  }

  getConfig(pluginName: string): Record<string, unknown> {
    const schema = this.getSchema(pluginName);
    const userConfig = this.#configLoader.getPluginConfig(pluginName) ?? {};

    const merged: Record<string, unknown> = {};
    for (const pref of schema) {
      merged[pref.name] = pref.name in userConfig ? userConfig[pref.name] : pref.default;
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
      let s: z.ZodTypeAny;
      switch (p.type) {
        case 'text':
        case 'password':
          // Required strings must be non-empty
          s = p.required ? z.string().min(1) : z.string();
          break;
        case 'number':
          s = z.number();
          if (p.min !== undefined) s = (s as z.ZodNumber).min(p.min);
          if (p.max !== undefined) s = (s as z.ZodNumber).max(p.max);
          break;
        case 'checkbox':
          s = z.boolean();
          break;
        case 'dropdown':
          s = z.enum(p.options.map((o) => o.value) as [string, ...string[]]);
          break;
      }
      shape[p.name] = p.required ? s : s.optional();
    }
    return z.object(shape);
  }
}
