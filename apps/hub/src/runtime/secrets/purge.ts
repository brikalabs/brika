/**
 * Standalone secret-index helpers, kept free of DI and the Logger graph so the
 * uninstaller (typechecked from the console package) can import them without
 * dragging hub-internal `@/`-aliased modules into a consumer's build.
 *
 * The index is a single keychain entry listing every qualified secret name
 * written under a service. Neither backend exposes enumeration (`Bun.secrets`
 * has no list API), so it is the only way to delete secrets whose key the
 * caller can't re-derive: runtime `setSecret` (`user.*`) keys, and the full
 * bucket on `brika uninstall --purge`.
 */

import { z } from 'zod';

/**
 * Reserved entry name holding the JSON array of qualified secret names
 * (`<plugin>::<key>`) under a service. The double-underscore name can never
 * collide with a real qualified name (those always contain the `::` separator).
 */
export const INDEX_ENTRY_NAME = '__index__';

export const INDEX_ENTRY_SCHEMA = z.array(z.string());

/**
 * Delete every keychain entry written under `serviceName`, driven by the
 * {@link INDEX_ENTRY_NAME} index. Used by `brika uninstall --purge` to wipe
 * the OS keychain bucket: file-backend secrets live under `${BRIKA_HOME}` and
 * go with the data dir, but keychain entries are external to it and must be
 * removed explicitly while the service name is still known.
 *
 * Best-effort: on a host with no Secret Service (`Bun.secrets` throws), there
 * is nothing in the keychain to remove and the file-backend path covers it, so
 * we return 0.
 *
 * Known gap: this only removes index-tracked entries. Secrets written by a
 * pre-index build and never re-saved since the upgrade are absent from the
 * index and survive `--purge` (Bun.secrets has no list API to enumerate them
 * generally). They self-heal into the index on the next write, and this is
 * still strictly better than the prior behavior (which wiped no keychain
 * entries on `--purge`). Per-plugin `deleteAllForPlugin` avoids the gap by
 * merging caller-declared keys with the index.
 *
 * @returns the number of entries removed.
 */
export async function purgeServiceSecrets(serviceName: string): Promise<number> {
  let names: string[];
  try {
    const raw = await Bun.secrets.get({ service: serviceName, name: INDEX_ENTRY_NAME });
    if (raw === null || raw === '') {
      return 0;
    }
    const parsed = INDEX_ENTRY_SCHEMA.safeParse(JSON.parse(raw));
    names = parsed.success ? parsed.data : [];
  } catch {
    return 0;
  }

  let removed = 0;
  for (const name of names) {
    try {
      if (await Bun.secrets.delete({ service: serviceName, name })) {
        removed += 1;
      }
    } catch {
      // Best-effort: skip an entry we can't remove rather than aborting the rest.
    }
  }
  await Bun.secrets.delete({ service: serviceName, name: INDEX_ENTRY_NAME }).catch(() => undefined);
  return removed;
}
