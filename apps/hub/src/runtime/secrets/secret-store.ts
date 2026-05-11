/**
 * SecretStore — wraps Bun.secrets (OS keychain) for plugin credentials.
 *
 * Plugin password-typed preferences and SDK __secret_* keys (e.g. OAuth tokens)
 * are persisted here instead of brika.yml. The service runs in the hub process
 * and is owned by PluginConfigService; the plugin process never calls it
 * directly — it receives resolved values via IPC sendPreferences.
 */

import { singleton } from '@brika/di';

const SERVICE = 'com.brika.hub';
const SEPARATOR = '::';
/**
 * Reserved namespace for hub-internal secrets (signaling token, etc.).
 * The double-underscore prefix is invalid in npm package names, so no real
 * plugin can ever collide with it.
 */
const HUB_NAMESPACE = '__hub__';

@singleton()
export class SecretStore {
  #qualify(pluginName: string, key: string): string {
    return `${pluginName}${SEPARATOR}${key}`;
  }

  async get(pluginName: string, key: string): Promise<string | null> {
    return await Bun.secrets.get({
      service: SERVICE,
      name: this.#qualify(pluginName, key),
    });
  }

  async set(pluginName: string, key: string, value: string): Promise<void> {
    await Bun.secrets.set({
      service: SERVICE,
      name: this.#qualify(pluginName, key),
      value,
    });
  }

  async delete(pluginName: string, key: string): Promise<boolean> {
    return await Bun.secrets.delete({
      service: SERVICE,
      name: this.#qualify(pluginName, key),
    });
  }

  /** Round-trip arbitrary JSON-serializable values (e.g. OAuth token blobs). */
  async getJSON<T = unknown>(pluginName: string, key: string): Promise<T | null> {
    const raw = await this.get(pluginName, key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON(pluginName: string, key: string, value: unknown): Promise<void> {
    await this.set(pluginName, key, JSON.stringify(value));
  }

  async deleteAllForPlugin(pluginName: string, keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(pluginName, key)));
  }

  // ─── Hub-internal secrets ──────────────────────────────────────────────
  // These keys live under a reserved namespace plugins cannot reach. Used
  // for credentials owned by the hub itself (e.g. the remote-access
  // signaling bearer token).

  async getHubSecret(key: string): Promise<string | null> {
    return await this.get(HUB_NAMESPACE, key);
  }

  async setHubSecret(key: string, value: string): Promise<void> {
    await this.set(HUB_NAMESPACE, key, value);
  }

  async deleteHubSecret(key: string): Promise<boolean> {
    return await this.delete(HUB_NAMESPACE, key);
  }
}
