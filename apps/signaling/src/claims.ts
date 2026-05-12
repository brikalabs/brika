/**
 * Claim store — persistent registry of `name → bearer token`.
 *
 * v0 storage: a single JSON file with atomic write-via-rename. Good enough
 * for one coordinator instance up to a few thousand hubs. v1 will swap this
 * for SQLite/Postgres so we can scale horizontally.
 *
 * Names are first-come-first-serve. Reserved names (admin, www, api, …) are
 * never claimable. Token rotation is supported via {@link rotateToken}.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { type Claim, ClaimError, generateToken, validateName } from '@brika/remote-access-protocol';

export {
  type Claim,
  ClaimError,
  RESERVED_NAMES,
  validateName,
} from '@brika/remote-access-protocol';

interface ClaimFile {
  readonly version: 1;
  readonly claims: Record<string, Claim>;
}

export class ClaimStore {
  readonly #path: string;
  readonly #map = new Map<string, Claim>();
  /** Reverse index: token → name. Built lazily, kept in sync with `#map`. */
  readonly #byToken = new Map<string, string>();
  #loaded = false;
  /** Serializes concurrent writes so we never race on the file. */
  #writeChain: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<void> {
    if (this.#loaded) {
      return;
    }
    try {
      const raw = await readFile(this.#path, 'utf8');
      const parsed = JSON.parse(raw) as ClaimFile;
      if (parsed?.version === 1 && parsed.claims && typeof parsed.claims === 'object') {
        for (const [name, claim] of Object.entries(parsed.claims)) {
          this.#map.set(name, claim);
          this.#byToken.set(claim.token, name);
        }
      }
    } catch (err) {
      // Missing file is fine — first run.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    this.#loaded = true;
  }

  /**
   * Claim a name on behalf of a fresh hub. Returns the issued token.
   * Throws {@link ClaimError} if the name is invalid, reserved, or taken.
   */
  async claim(rawName: string): Promise<Claim> {
    const name = validateName(rawName);
    if (this.#map.has(name)) {
      throw new ClaimError('taken', `"${name}" is already claimed`);
    }
    const claim: Claim = {
      name,
      token: generateToken(),
      createdAt: Date.now(),
    };
    this.#map.set(name, claim);
    this.#byToken.set(claim.token, name);
    await this.#persist();
    return claim;
  }

  /** Rotate the token for an existing claim. Caller must have authenticated. */
  async rotateToken(name: string): Promise<Claim> {
    const existing = this.#map.get(name);
    if (!existing) {
      throw new ClaimError('unknown', `"${name}" is not claimed`);
    }
    this.#byToken.delete(existing.token);
    const next: Claim = { ...existing, token: generateToken() };
    this.#map.set(name, next);
    this.#byToken.set(next.token, name);
    await this.#persist();
    return next;
  }

  /** Release a claim. Caller must have authenticated. */
  async release(name: string): Promise<boolean> {
    const existing = this.#map.get(name);
    if (!existing) {
      return false;
    }
    this.#map.delete(name);
    this.#byToken.delete(existing.token);
    await this.#persist();
    return true;
  }

  /** Find the claim that owns a given bearer token, in constant lookup time. */
  findByToken(token: string): Claim | undefined {
    const name = this.#byToken.get(token);
    return name ? this.#map.get(name) : undefined;
  }

  get(name: string): Claim | undefined {
    return this.#map.get(name);
  }

  size(): number {
    return this.#map.size;
  }

  async #persist(): Promise<void> {
    const snapshot: ClaimFile = {
      version: 1,
      claims: Object.fromEntries(this.#map),
    };
    const next = this.#writeChain.then(async () => {
      const tmp = `${this.#path}.tmp`;
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
      await rename(tmp, this.#path);
    });
    // Swallow errors on the chain pointer so a single failed write doesn't
    // poison every subsequent claim — but still surface them to the caller.
    this.#writeChain = next.catch(() => undefined);
    await next;
  }
}
