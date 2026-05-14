/**
 * KeychainBackend — direct pass-through to Bun.secrets.
 *
 * Used on platforms that expose a working Secret Service (macOS Keychain,
 * Windows Credential Manager, Linux desktop with libsecret + gnome-keyring /
 * KWallet). On headless Linux (Docker, server installs), Bun.secrets throws
 * `ERR_SECRETS_PLATFORM_ERROR` and the file backend takes over.
 */

import type { SecretBackend, SecretRef } from './types';

export class KeychainBackend implements SecretBackend {
  async get(ref: SecretRef): Promise<string | null> {
    return await Bun.secrets.get({ service: ref.service, name: ref.name });
  }

  async set(ref: SecretRef & { value: string }): Promise<void> {
    await Bun.secrets.set({ service: ref.service, name: ref.name, value: ref.value });
  }

  async delete(ref: SecretRef): Promise<boolean> {
    return await Bun.secrets.delete({ service: ref.service, name: ref.name });
  }
}
