/**
 * SecretStore — wraps Bun.secrets (OS keychain) for plugin credentials.
 *
 * Plugin password-typed preferences and SDK __secret_* keys (e.g. OAuth tokens)
 * are persisted here instead of brika.yml. The service runs in the hub process
 * and is owned by PluginConfigService; the plugin process never calls it
 * directly — it receives resolved values via IPC sendPreferences.
 *
 * Each `.brika/` directory gets its own Keychain bucket via a per-instance
 * UID suffix on the service name (`dev.brika.hub.<8hex>`). Two Brika installs
 * on the same machine never see each other's secrets, even if both run as
 * the same OS user. The UID lives in `${BRIKA_HOME}/instance.id` — wipe
 * the directory and a fresh UID (and fresh Keychain bucket) is generated
 * on next boot.
 */

import { inject, singleton } from '@brika/di';
import { BrikaInitializer } from '../config/brika-initializer';

const SERVICE_BASE = 'dev.brika.hub';
const SEPARATOR = '::';
/**
 * Reserved namespace for hub-internal secrets (signaling token, etc.).
 * The double-underscore prefix is invalid in npm package names, so no real
 * plugin can ever collide with it.
 */
const HUB_NAMESPACE = '__hub__';

@singleton()
export class SecretStore {
  readonly #init = inject(BrikaInitializer);

  /** Per-instance Keychain service identifier (e.g. `dev.brika.hub.7f3e8a2c`). */
  get #service(): string {
    return `${SERVICE_BASE}.${this.#init.instanceId}`;
  }

  #qualify(pluginName: string, key: string): string {
    return `${pluginName}${SEPARATOR}${key}`;
  }

  async get(pluginName: string, key: string): Promise<string | null> {
    return await Bun.secrets.get({
      service: this.#service,
      name: this.#qualify(pluginName, key),
    });
  }

  async set(pluginName: string, key: string, value: string): Promise<void> {
    await Bun.secrets.set({
      service: this.#service,
      name: this.#qualify(pluginName, key),
      value,
    });
  }

  async delete(pluginName: string, key: string): Promise<boolean> {
    return await Bun.secrets.delete({
      service: this.#service,
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
