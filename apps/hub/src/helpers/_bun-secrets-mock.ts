/**
 * In-memory replacement for Bun.secrets so unit tests don't touch the OS keychain.
 * Call install() in beforeEach and restore() in afterEach.
 */

import { spyOn } from 'bun:test';

interface SecretRef {
  service: string;
  name: string;
}

const KEY = (s: SecretRef) => `${s.service}::${s.name}`;

export interface BunSecretsMock {
  store: Map<string, string>;
  restore(): void;
}

export function installBunSecretsMock(): BunSecretsMock {
  const store = new Map<string, string>();

  const getSpy = spyOn(Bun.secrets, 'get').mockImplementation(
    async (opts: SecretRef) => store.get(KEY(opts)) ?? null
  );
  const setSpy = spyOn(Bun.secrets, 'set').mockImplementation(
    async (opts: SecretRef & { value: string }) => {
      if (opts.value === '') {
        store.delete(KEY(opts));
        return;
      }
      store.set(KEY(opts), opts.value);
    }
  );
  const deleteSpy = spyOn(Bun.secrets, 'delete').mockImplementation(async (opts: SecretRef) =>
    store.delete(KEY(opts))
  );

  return {
    store,
    restore() {
      getSpy.mockRestore();
      setSpy.mockRestore();
      deleteSpy.mockRestore();
    },
  };
}
