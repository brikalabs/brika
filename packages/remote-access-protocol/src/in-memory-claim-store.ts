/**
 * Map-backed {@link ClaimStore} test double. Exposed via the `/testing`
 * subpath export so it never reaches production bundles. Useful for unit
 * tests and the standalone end-to-end test, which boots a real server against
 * an in-memory store.
 */

import {
  type ClaimRow,
  type ClaimStore,
  type ClaimsExecutor,
  createClaimStore,
} from './claim-store';

export function createInMemoryClaimStore(): ClaimStore {
  const byName = new Map<string, ClaimRow>();
  const byTokenHash = new Map<string, ClaimRow>();

  const executor: ClaimsExecutor = {
    selectByName: (name) => Promise.resolve(byName.get(name) ?? null),
    selectByTokenHash: (hash) => Promise.resolve(byTokenHash.get(hash) ?? null),
    count: () => Promise.resolve(byName.size),

    insertIfAbsent: (row) => {
      if (byName.has(row.name)) {
        return Promise.resolve(false);
      }
      byName.set(row.name, row);
      byTokenHash.set(row.token_hash, row);
      return Promise.resolve(true);
    },

    updateTokenHash: (name, hash) => {
      const row = byName.get(name);
      if (row) {
        byTokenHash.delete(row.token_hash);
        row.token_hash = hash;
        byTokenHash.set(hash, row);
      }
      return Promise.resolve();
    },

    updateRecoveryHash: (name, hash) => {
      const row = byName.get(name);
      if (row) {
        row.recovery_hash = hash;
      }
      return Promise.resolve();
    },

    updateTokenAndRecovery: (name, tokenHash, recoveryHash) => {
      const row = byName.get(name);
      if (row) {
        byTokenHash.delete(row.token_hash);
        row.token_hash = tokenHash;
        row.recovery_hash = recoveryHash;
        byTokenHash.set(tokenHash, row);
      }
      return Promise.resolve();
    },

    deleteByName: (name) => {
      const row = byName.get(name);
      if (!row) {
        return Promise.resolve(false);
      }
      byName.delete(name);
      byTokenHash.delete(row.token_hash);
      return Promise.resolve(true);
    },
  };

  return createClaimStore(executor);
}
