/**
 * Plugin Config Service - Manages plugin preferences with Zod validation.
 *
 * Secret-typed values (password preferences, SDK __secret_* keys) are stored
 * in the OS keychain via SecretStore — never written to brika.yml. The YAML
 * keeps a `null` sentinel for each __secret_* key as a presence index so
 * getConfig knows which keys to resolve from the keychain.
 */

import { inject, singleton } from '@brika/di';
import type { PreferenceDefinition } from '@brika/plugin';
import { z } from 'zod';
import { type BrikaConfig, ConfigLoader } from '@/runtime/config';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { StateStore } from '@/runtime/state/state-store';

const SECRET_PREFIX = '__secret_';
const SECRET_PLACEHOLDER = '***';

@singleton()
export class PluginConfigService {
  readonly #configLoader = inject(ConfigLoader);
  readonly #state = inject(StateStore);
  readonly #secrets = inject(SecretStore);

  getSchema(pluginName: string): PreferenceDefinition[] {
    const metadata = this.#state.getMetadata(pluginName);
    const prefs: PreferenceDefinition[] | undefined = metadata?.preferences;
    return prefs ?? [];
  }

  /**
   * Resolved config for internal hub use — passed to the running plugin process.
   * Password values and __secret_* keys are read from the OS keychain.
   */
  async getConfig(pluginName: string): Promise<Record<string, unknown>> {
    return await this.#buildConfig(pluginName, async (pref) => {
      if (pref.type !== 'password') {
        return undefined;
      }
      const stored = await this.#secrets.get(pluginName, pref.name);
      return stored ?? pref.default ?? '';
    });
  }

  /**
   * Config for API responses — masks password values and omits __secret_* keys.
   */
  async getConfigForApi(pluginName: string): Promise<Record<string, unknown>> {
    const schema = this.getSchema(pluginName);
    const userConfig = this.#configLoader.getPluginConfig(pluginName) ?? {};

    const masked: Record<string, unknown> = {};

    for (const pref of schema) {
      if (pref.type === 'link') {
        continue;
      }
      if (pref.type === 'password') {
        const stored = await this.#secrets.get(pluginName, pref.name);
        masked[pref.name] = stored ? SECRET_PLACEHOLDER : '';
        continue;
      }
      masked[pref.name] = pref.name in userConfig ? userConfig[pref.name] : pref.default;
    }

    // Non-secret __* keys remain visible to the UI; __secret_* are hidden.
    for (const key of Object.keys(userConfig)) {
      if (key.startsWith('__') && !key.startsWith(SECRET_PREFIX)) {
        masked[key] = userConfig[key];
      }
    }

    return masked;
  }

  /**
   * Walk schema + userConfig once, letting the caller resolve password values
   * (the only branch that differs between internal and API-shaped reads).
   */
  async #buildConfig(
    pluginName: string,
    resolvePassword: (pref: PreferenceDefinition) => Promise<unknown> | undefined
  ): Promise<Record<string, unknown>> {
    const schema = this.getSchema(pluginName);
    const userConfig = this.#configLoader.getPluginConfig(pluginName) ?? {};
    const merged: Record<string, unknown> = {};

    for (const pref of schema) {
      if (pref.type === 'link') {
        continue;
      }
      const resolved = await resolvePassword(pref);
      if (resolved !== undefined) {
        merged[pref.name] = resolved;
        continue;
      }
      merged[pref.name] = pref.name in userConfig ? userConfig[pref.name] : pref.default;
    }

    await this.#mergeInternalKeys(pluginName, userConfig, merged);
    return merged;
  }

  /**
   * SDK-internal keys persisted via updatePreference. __secret_* keys live in
   * the keychain (YAML holds a null sentinel); other __* keys keep their
   * YAML value as-is.
   */
  async #mergeInternalKeys(
    pluginName: string,
    userConfig: Record<string, unknown>,
    target: Record<string, unknown>
  ): Promise<void> {
    for (const key of Object.keys(userConfig)) {
      if (!key.startsWith('__')) {
        continue;
      }
      if (!key.startsWith(SECRET_PREFIX)) {
        target[key] = userConfig[key];
        continue;
      }
      const stored = await this.#secrets.getJSON(pluginName, key);
      if (stored !== null) {
        target[key] = stored;
      }
    }
  }

  validate(pluginName: string, config: Record<string, unknown>) {
    const schema = this.getSchema(pluginName);
    return this.#buildZodSchema(schema).safeParse(config);
  }

  /**
   * Persist incoming config. Password values and __secret_* keys are routed
   * to the keychain; remaining keys are written to brika.yml. The placeholder
   * "***" for a password field is treated as "no change".
   */
  async setConfig(pluginName: string, config: Record<string, unknown>) {
    const result = this.validate(pluginName, config);
    if (!result.success) {
      return result;
    }

    const schema = this.getSchema(pluginName);
    const passwordPrefs = new Set(schema.filter((p) => p.type === 'password').map((p) => p.name));

    const yamlBody: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      if (passwordPrefs.has(key)) {
        await this.#applyPasswordChange(pluginName, key, value);
        continue;
      }
      if (key.startsWith(SECRET_PREFIX)) {
        await this.#applySecretChange(pluginName, key, value, yamlBody);
        continue;
      }
      yamlBody[key] = value;
    }

    await this.#configLoader.setPluginConfig(pluginName, yamlBody);
    return result;
  }

  /**
   * Keys to delete from the keychain when a plugin is uninstalled.
   * Combines password prefs from the schema and __secret_* keys present in YAML.
   */
  getSecretKeysForPlugin(pluginName: string): string[] {
    const schema = this.getSchema(pluginName);
    const userConfig = this.#configLoader.getPluginConfig(pluginName) ?? {};
    const passwordKeys = schema.filter((p) => p.type === 'password').map((p) => p.name);
    const internalSecretKeys = Object.keys(userConfig).filter((k) => k.startsWith(SECRET_PREFIX));
    return [...passwordKeys, ...internalSecretKeys];
  }

  /**
   * Remove legacy plaintext secrets from brika.yml.
   *
   * Run once on boot — any password-typed value or pre-migration OAuth token
   * (`__oauth_*_token`) still present in YAML is cleared. Users re-authenticate
   * affected plugins; the new `__secret_*` keychain path takes over.
   *
   * Returns the number of plugins whose config was modified.
   */
  async scrubLegacySecrets(config: BrikaConfig): Promise<number> {
    let pluginsScrubbed = 0;

    for (const entry of config.plugins) {
      if (!entry.config) {
        continue;
      }
      const schema = this.getSchema(entry.name);
      const passwordPrefs = new Set(schema.filter((p) => p.type === 'password').map((p) => p.name));

      let changed = false;
      for (const key of Object.keys(entry.config)) {
        if (this.#isLegacyPlaintextSecret(key, entry.config[key], passwordPrefs)) {
          delete entry.config[key];
          changed = true;
        }
      }

      if (changed) {
        pluginsScrubbed += 1;
      }
    }

    if (pluginsScrubbed > 0) {
      await this.#configLoader.save(config);
    }

    return pluginsScrubbed;
  }

  #isLegacyPlaintextSecret(
    key: string,
    value: unknown,
    passwordPrefs: ReadonlySet<string>
  ): boolean {
    const isPasswordPref = passwordPrefs.has(key) && typeof value === 'string' && value !== '';
    const isLegacyOAuthToken = key.startsWith('__oauth_') && key.endsWith('_token');
    return isPasswordPref || isLegacyOAuthToken;
  }

  async #applyPasswordChange(pluginName: string, key: string, value: unknown): Promise<void> {
    if (value === SECRET_PLACEHOLDER) {
      return;
    }
    if (typeof value !== 'string') {
      return;
    }
    if (value === '') {
      await this.#secrets.delete(pluginName, key);
      return;
    }
    await this.#secrets.set(pluginName, key, value);
  }

  async #applySecretChange(
    pluginName: string,
    key: string,
    value: unknown,
    yamlBody: Record<string, unknown>
  ): Promise<void> {
    if (value === null || value === undefined) {
      await this.#secrets.delete(pluginName, key);
      return;
    }
    await this.#secrets.setJSON(pluginName, key, value);
    yamlBody[key] = null;
  }

  #buildZodSchema(prefs: PreferenceDefinition[]) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const p of prefs) {
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
