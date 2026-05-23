/**
 * SecretBackend — pluggable persistence layer for SecretStore.
 *
 * Two implementations exist:
 *   - KeychainBackend: OS keychain via Bun.secrets (macOS Keychain, libsecret,
 *     Windows Credential Manager). The default on user-facing platforms.
 *   - FileBackend: AES-256-GCM encrypted JSON file under `${BRIKA_HOME}`.
 *     Used in headless / container environments where no Secret Service is
 *     available (e.g. the Docker image runs against debian-slim with no
 *     gnome-keyring or D-Bus session).
 *
 * The (service, name) tuple matches Bun.secrets' addressing so the keychain
 * backend is a trivial pass-through. File backend treats the tuple as a
 * composite primary key.
 */

export interface SecretRef {
  /** Per-instance namespace, e.g. `dev.brika.hub.<instanceId>`. */
  readonly service: string;
  /** Qualified key, e.g. `<pluginName>::<key>`. */
  readonly name: string;
}

export interface SecretBackend {
  get(ref: SecretRef): Promise<string | null>;
  set(ref: SecretRef & { readonly value: string }): Promise<void>;
  /** Returns true if a value was removed, false if it did not exist. */
  delete(ref: SecretRef): Promise<boolean>;
}
