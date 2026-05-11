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

export interface Claim {
  /** Unique hub name (subdomain), lowercase, validated. */
  readonly name: string;
  /** Opaque bearer token the hub uses on the signaling WebSocket. */
  readonly token: string;
  /** Unix epoch (ms) the claim was first issued. */
  readonly createdAt: number;
}

interface ClaimFile {
  readonly version: 1;
  readonly claims: Record<string, Claim>;
}

/** Names we'll never let a user claim. Tweak as needed. */
export const RESERVED_NAMES = new Set<string>([
  'admin',
  'api',
  'app',
  'auth',
  'brika',
  'docs',
  'help',
  'mail',
  'public',
  'root',
  'static',
  'support',
  'system',
  'webhook',
  'webhooks',
  'www',
]);

const NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;
const TOKEN_BYTES = 32;

export class ClaimError extends Error {
  readonly code: 'invalid-name' | 'reserved' | 'taken' | 'unknown' | 'unauthorized';
  constructor(code: ClaimError['code'], message: string) {
    super(message);
    this.name = 'ClaimError';
    this.code = code;
  }
}

export function validateName(name: string): string {
  const lower = name.toLowerCase();
  if (!NAME_PATTERN.test(lower)) {
    throw new ClaimError(
      'invalid-name',
      'Name must be 4-32 chars: lowercase letters, digits, hyphens; start with a letter, end alphanumeric'
    );
  }
  if (RESERVED_NAMES.has(lower)) {
    throw new ClaimError('reserved', `"${lower}" is reserved`);
  }
  return lower;
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let s = '';
  for (const b of bytes) {
    s += String.fromCodePoint(b);
  }
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export class ClaimStore {
  readonly #path: string;
  #map = new Map<string, Claim>();
  /** Reverse index: token → name. Built lazily, kept in sync with `#map`. */
  #byToken = new Map<string, string>();
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
