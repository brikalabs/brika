/**
 * `secrets` migration scope — placeholder for future encryption-key
 * rotation and storage-format upgrades.
 *
 * v1 is intentionally a no-op stamp: it marks "this install's secret
 * store has been audited at SDK version X" so future migrations can
 * branch on `previouslyApplied.includes('0001-stamp-v1')` to detect
 * "fresh install" vs "upgraded from pre-Phase-2". Without this
 * stamp we'd have no way to tell.
 *
 * The actual SecretStore (Keychain / encrypted file) is *not* touched
 * here. When we ship a real schema change (e.g. switching the file
 * backend to AES-GCM-SIV or rotating master keys), append a new
 * migration to this list.
 */

import type { Migration, MigrationScope } from '../types';

const stampV1: Migration = {
  id: '0001-stamp-v1',
  description: 'Mark the secret store as v1-format (no-op stamp)',
  run(): Promise<void> {
    // Intentional no-op. Presence of this ID in the ledger means
    // "we've seen this install".
    return Promise.resolve();
  },
};

export const secretsScope: MigrationScope = {
  name: 'secrets',
  migrations: [stampV1],
};
