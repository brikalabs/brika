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
import { ConfigLoader } from '@/runtime/config';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { StateStore } from '@/runtime/state/state-store';

const SECRET_PREFIX = '__secret_';
const SECRET_PLACEHOLDER = '***';

type ValuedPreference = Exclude<PreferenceDefinition, { type: 'link' }>;

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
   *
   * An operator may hand-write a plaintext secret directly in `brika.yml` (under
   * a password-typed field, or a `__secret_*` key). Before resolving, we absorb
   * any such plaintext into the keychain and scrub it back to a presence marker,
   * so the secret never persists in plaintext on disk.
   */
  async getConfig(pluginName: string): Promise<Record<string, unknown>> {
    const schema = this.getSchema(pluginName);
    let userConfig = this.#configLoader.getPluginConfig(pluginName) ?? {};

    const scrubbed = await this.#ingestPlaintextSecrets(pluginName, schema, userConfig);
    if (scrubbed) {
      await this.#configLoader.setPluginConfig(pluginName, scrubbed);
      userConfig = scrubbed;
    }

    const merged: Record<string, unknown> = {};

    for (const pref of schema) {
      if (pref.type === 'link') {
        continue;
      }
      merged[pref.name] = await this.#readPrefValue(pluginName, pref, userConfig);
    }

    for (const key of Object.keys(userConfig)) {
      if (!key.startsWith('__')) {
        continue;
      }
      const value = await this.#readInternalKey(pluginName, key, userConfig);
      if (value !== undefined) {
        merged[key] = value;
      }
    }

    return merged;
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
      masked[pref.name] = await this.#readMaskedPrefValue(pluginName, pref, userConfig);
    }

    for (const key of Object.keys(userConfig)) {
      if (key.startsWith('__') && !key.startsWith(SECRET_PREFIX)) {
        masked[key] = userConfig[key];
      }
    }

    return masked;
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
        await this.#writePassword(pluginName, key, value);
        continue;
      }
      if (key.startsWith(SECRET_PREFIX)) {
        await this.#writeInternalSecret(pluginName, key, value, yamlBody);
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
   * Absorb any hand-written plaintext secrets in `userConfig` into the keychain
   * and return a scrubbed copy to persist, or `null` when there was nothing to
   * ingest. Password-typed fields are removed entirely (their presence is
   * schema-derived); `__secret_*` keys keep a `null` presence marker. Idempotent:
   * once scrubbed, a later pass finds no plaintext and returns `null`.
   */
  async #ingestPlaintextSecrets(
    pluginName: string,
    schema: PreferenceDefinition[],
    userConfig: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const passwordPrefs = new Set(schema.filter((p) => p.type === 'password').map((p) => p.name));
    const scrubbed: Record<string, unknown> = { ...userConfig };
    let changed = false;

    for (const [key, value] of Object.entries(userConfig)) {
      if (passwordPrefs.has(key)) {
        // A masked sentinel that got persisted is meaningless on disk — drop it.
        if (value === SECRET_PLACEHOLDER) {
          delete scrubbed[key];
          changed = true;
        } else if (typeof value === 'string' && value.length > 0) {
          await this.#secrets.set(pluginName, key, value);
          delete scrubbed[key];
          changed = true;
        }
        continue;
      }
      if (key.startsWith(SECRET_PREFIX) && value !== null && value !== undefined) {
        await this.#secrets.setJSON(pluginName, key, value);
        scrubbed[key] = null;
        changed = true;
      }
    }

    return changed ? scrubbed : null;
  }

  async #readPrefValue(
    pluginName: string,
    pref: ValuedPreference,
    userConfig: Record<string, unknown>
  ): Promise<unknown> {
    if (pref.type === 'password') {
      return (await this.#secrets.get(pluginName, pref.name)) ?? pref.default ?? '';
    }
    return pref.name in userConfig ? userConfig[pref.name] : pref.default;
  }

  async #readMaskedPrefValue(
    pluginName: string,
    pref: ValuedPreference,
    userConfig: Record<string, unknown>
  ): Promise<unknown> {
    if (pref.type === 'password') {
      return (await this.#secrets.get(pluginName, pref.name)) ? SECRET_PLACEHOLDER : '';
    }
    return pref.name in userConfig ? userConfig[pref.name] : pref.default;
  }

  async #readInternalKey(
    pluginName: string,
    key: string,
    userConfig: Record<string, unknown>
  ): Promise<unknown> {
    if (!key.startsWith(SECRET_PREFIX)) {
      return userConfig[key];
    }
    return (await this.#secrets.getJSON(pluginName, key)) ?? undefined;
  }

  async #writePassword(pluginName: string, key: string, value: unknown): Promise<void> {
    if (value === SECRET_PLACEHOLDER) {
      return;
    }
    if (value === '') {
      await this.#secrets.delete(pluginName, key);
      return;
    }
    if (typeof value === 'string') {
      await this.#secrets.set(pluginName, key, value);
    }
  }

  async #writeInternalSecret(
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
