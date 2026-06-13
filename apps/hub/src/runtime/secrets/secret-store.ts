/**
 * SecretStore — credential storage for plugin secrets and hub-owned tokens.
 *
 * Plugin password-typed preferences and SDK __secret_* keys (e.g. OAuth tokens)
 * are persisted here instead of brika.yml. The service runs in the hub process
 * and is owned by PluginConfigService; the plugin process never calls it
 * directly — it receives resolved values via IPC sendPreferences.
 *
 * Backend (see ./backends):
 *   - KeychainBackend (default on desktops): Bun.secrets → OS keychain
 *   - FileBackend (containers / headless): AES-256-GCM encrypted JSON
 *
 * Selection is controlled by `BRIKA_SECRETS_BACKEND` (auto | keychain | file).
 * In `auto` mode the store starts with the keychain and transparently swaps
 * to the file backend the first time `Bun.secrets` raises
 * `ERR_SECRETS_PLATFORM_ERROR` — the canonical signal that no Secret Service
 * is reachable on this host.
 *
 * Each `.brika/` directory gets its own bucket via a per-instance UID
 * (`dev.brika.hub.<8hex>`) — two installs on the same machine never see
 * each other's secrets. The file backend file (and master key) live under
 * `${BRIKA_HOME}` and benefit from the same isolation.
 */

import { inject, singleton } from '@brika/di';
import { brikaContext } from '../context/brika-context';
import { Logger } from '../logs/log-router';
import { FileBackend } from './backends/file-backend';
import { KeychainBackend } from './backends/keychain-backend';
import type { SecretBackend } from './backends/types';
import { SECRET_INDEX_NAME, SECRET_INDEX_SCHEMA } from './purge';

// Re-exported so the standalone purge stays importable via the SecretStore
// module (its public surface) without pulling the Logger graph into consumers.
export { purgeServiceSecrets, SECRET_INDEX_NAME } from './purge';

const SEPARATOR = '::';
/**
 * Reserved namespace for hub-internal secrets (signaling token, etc.).
 * The double-underscore prefix is invalid in npm package names, so no real
 * plugin can ever collide with it.
 */
const HUB_NAMESPACE = '__hub__';

type Mode = 'auto' | 'keychain' | 'file';

function parseMode(value: string | undefined): Mode {
  if (value === undefined || value === '' || value === 'auto') {
    return 'auto';
  }
  if (value === 'keychain' || value === 'file') {
    return value;
  }
  throw new Error(
    `Invalid BRIKA_SECRETS_BACKEND="${value}" (expected one of: auto, keychain, file)`
  );
}

function isPlatformError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'ERR_SECRETS_PLATFORM_ERROR';
}

@singleton()
export class SecretStore {
  readonly #log = inject(Logger).withSource('secrets');
  readonly #mode: Mode;
  #backend: SecretBackend;
  /** Has the chosen backend been logged at least once? Avoids noise on every call. */
  #announced = false;
  /** Serialises read-modify-write of {@link SECRET_INDEX_NAME} so concurrent
   *  set/delete from async callers cannot lose an index entry. */
  #indexChain: Promise<unknown> = Promise.resolve();

  constructor() {
    this.#mode = parseMode(process.env.BRIKA_SECRETS_BACKEND);
    this.#backend = this.#mode === 'file' ? new FileBackend() : new KeychainBackend();
  }

  /** Per-instance bucket identifier (e.g. `dev.brika.hub.7f3e8a2c`). */
  get #service(): string {
    return brikaContext.serviceName;
  }

  #qualify(pluginName: string, key: string): string {
    return `${pluginName}${SEPARATOR}${key}`;
  }

  #announce(): void {
    if (this.#announced) {
      return;
    }
    this.#announced = true;
    const kind = this.#backend instanceof KeychainBackend ? 'keychain' : 'file';
    this.#log.info(`Using ${kind} backend for secrets`);
  }

  /**
   * Run a backend operation, transparently falling back to the file backend
   * the first time `Bun.secrets` reports the host has no Secret Service.
   * In explicit `keychain` / `file` mode, errors propagate to the caller.
   */
  async #call<T>(op: (backend: SecretBackend) => Promise<T>): Promise<T> {
    try {
      const result = await op(this.#backend);
      this.#announce();
      return result;
    } catch (error) {
      if (
        this.#mode !== 'auto' ||
        this.#backend instanceof FileBackend ||
        !isPlatformError(error)
      ) {
        throw error;
      }
      this.#log.warn(
        'OS keychain is not available on this host (ERR_SECRETS_PLATFORM_ERROR); falling back to encrypted file backend'
      );
      this.#backend = new FileBackend();
      this.#announced = false;
      const result = await op(this.#backend);
      this.#announce();
      return result;
    }
  }

  async get(pluginName: string, key: string): Promise<string | null> {
    return await this.#call((b) =>
      b.get({ service: this.#service, name: this.#qualify(pluginName, key) })
    );
  }

  async set(pluginName: string, key: string, value: string): Promise<void> {
    const name = this.#qualify(pluginName, key);
    await this.#call((b) => b.set({ service: this.#service, name, value }));
    await this.#mutateIndex((names) => names.add(name));
  }

  async delete(pluginName: string, key: string): Promise<boolean> {
    const name = this.#qualify(pluginName, key);
    const existed = await this.#call((b) => b.delete({ service: this.#service, name }));
    await this.#mutateIndex((names) => names.delete(name));
    return existed;
  }

  // ─── Key index ─────────────────────────────────────────────────────────
  // Persisted so `deleteAllForPlugin` and the uninstall purge can enumerate
  // entries the caller can't re-derive (runtime `user.*` secrets, OAuth blobs).

  async #readIndex(): Promise<string[]> {
    const raw = await this.#call((b) => b.get({ service: this.#service, name: SECRET_INDEX_NAME }));
    if (raw === null || raw === '') {
      return [];
    }
    try {
      const parsed = SECRET_INDEX_SCHEMA.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : [];
    } catch {
      // Corrupt index: treat as empty rather than wedging every secret write.
      return [];
    }
  }

  async #writeIndex(names: string[]): Promise<void> {
    if (names.length === 0) {
      await this.#call((b) => b.delete({ service: this.#service, name: SECRET_INDEX_NAME }));
      return;
    }
    await this.#call((b) =>
      b.set({ service: this.#service, name: SECRET_INDEX_NAME, value: JSON.stringify(names) })
    );
  }

  #mutateIndex(mutate: (names: Set<string>) => void): Promise<void> {
    const next = this.#indexChain.then(async () => {
      const current = await this.#readIndex();
      const set = new Set(current);
      mutate(set);
      const unchanged = set.size === current.length && current.every((n) => set.has(n));
      if (unchanged) {
        return;
      }
      await this.#writeIndex([...set]);
    });
    // Swallow on the chain so one failed mutation doesn't poison later writes;
    // the original promise still rejects to this caller.
    this.#indexChain = next.catch(() => undefined);
    return next;
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

  /**
   * Delete every secret a plugin owns. `keys` (declared password prefs +
   * `__secret_*` from the schema/YAML) covers entries written before the index
   * existed; the index covers everything else, notably runtime `setSecret`
   * (`user.*`) keys that have no other on-disk trace. Each `delete` keeps the
   * index in sync, so the entry self-removes as it goes.
   */
  async deleteAllForPlugin(pluginName: string, keys: readonly string[] = []): Promise<void> {
    const prefix = `${pluginName}${SEPARATOR}`;
    const fromIndex = (await this.#readIndex())
      .filter((name) => name.startsWith(prefix))
      .map((name) => name.slice(prefix.length));
    const all = new Set<string>([...keys, ...fromIndex]);
    await Promise.all([...all].map((key) => this.delete(pluginName, key)));
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
