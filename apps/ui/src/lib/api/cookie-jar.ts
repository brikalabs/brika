/**
 * In-memory cookie jar for {@link DataChannelTransport}.
 *
 * When the hub responds over the data channel its `Set-Cookie` headers arrive
 * as RPC frames in JavaScript-land — the browser's networking layer never
 * sees them, so it can't populate its real cookie jar. This class fills the
 * gap: it parses incoming `Set-Cookie` values, stores name/value/path/expiry,
 * and composes a `Cookie` request header on subsequent calls. The hub's
 * `verifyToken` middleware accepts both cookies and `Authorization: Bearer`,
 * so this is the cheapest end-to-end fix.
 *
 * Scope: jars are namespaced by hub name in storage. Switching hubs gets a
 * fresh jar — credentials never bleed across identities. Stale jars from
 * previously-visited hubs are swept on construction.
 *
 * Persistence: `sessionStorage`. Tab-scoped, so closing the tab logs the user
 * out — a reasonable XSS blast-radius reduction vs `localStorage` and a fair
 * match for the HttpOnly intent that the LAN setup relied on. The Path
 * attribute is honored; Domain and HttpOnly are ignored (irrelevant once
 * we're in JS); Secure is treated as always-true (the channel itself is
 * DTLS-encrypted end-to-end). `Set-Cookie` values whose Path falls outside
 * the API surface are rejected — the jar is only ever consulted for `/api/*`
 * requests, so anything else would be dead weight that an attacker hub could
 * use to bloat sessionStorage or interfere with future scope changes.
 */

const STORAGE_PREFIX = 'brika.remote.cookies::';
/** Cookies whose Path falls outside this prefix are rejected. */
const ALLOWED_PATH_PREFIX = '/api';

interface StoredCookie {
  readonly name: string;
  readonly value: string;
  readonly path: string;
  /** Unix epoch ms. Undefined = session cookie (kept for the tab lifetime). */
  readonly expiresAt?: number;
}

export interface CookieJarOptions {
  /** Hub name binding — jars from other hubs are dropped on construction. */
  readonly hubName: string;
}

function parseExpiresAt(
  maxAge: string | undefined,
  expires: string | undefined
): number | undefined {
  if (maxAge !== undefined) {
    const seconds = Number.parseInt(maxAge, 10);
    if (Number.isFinite(seconds)) {
      return Date.now() + seconds * 1000;
    }
  }
  if (expires !== undefined) {
    const t = Date.parse(expires);
    if (Number.isFinite(t)) {
      return t;
    }
  }
  return undefined;
}

/**
 * Parse a single `Set-Cookie` header value. Returns `null` for malformed
 * input. `name=` with an empty value + an immediate expiry deletes a cookie.
 */
export function parseSetCookie(raw: string): StoredCookie | null {
  const parts = raw.split(';').map((p) => p.trim());
  const first = parts[0];
  if (!first) {
    return null;
  }
  const eqIdx = first.indexOf('=');
  if (eqIdx < 0) {
    return null;
  }
  const name = first.slice(0, eqIdx);
  const value = first.slice(eqIdx + 1);
  let path = '/';
  let maxAge: string | undefined;
  let expires: string | undefined;
  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i] ?? '';
    const aEq = attr.indexOf('=');
    const aName = (aEq < 0 ? attr : attr.slice(0, aEq)).toLowerCase();
    const aValue = aEq < 0 ? '' : attr.slice(aEq + 1);
    if (aName === 'path') {
      path = aValue || '/';
    } else if (aName === 'max-age') {
      maxAge = aValue;
    } else if (aName === 'expires') {
      expires = aValue;
    }
  }
  const expiresAt = parseExpiresAt(maxAge, expires);
  return { name, value, path, expiresAt };
}

/**
 * `Set-Cookie` Path falls outside the surface this jar is allowed to vend.
 * A hub-controlled cookie targeting `/admin/...` is meaningless here — the
 * jar is only consulted for `/api/*` requests — and a stored junk cookie is
 * pure attack surface with no benefit.
 */
function isPathAllowed(path: string): boolean {
  return path === '/' || path === ALLOWED_PATH_PREFIX || path.startsWith(`${ALLOWED_PATH_PREFIX}/`);
}

export class CookieJar {
  readonly #cookies = new Map<string, StoredCookie>();
  readonly #storageKey: string;

  constructor(options: CookieJarOptions) {
    this.#storageKey = `${STORAGE_PREFIX}${options.hubName}`;
    clearStaleHubJars(this.#storageKey);
    this.#load();
  }

  /** Apply a `Set-Cookie` header value. Multiple values come as multiple calls. */
  store(setCookieValue: string): void {
    const parsed = parseSetCookie(setCookieValue);
    if (!parsed || !isPathAllowed(parsed.path)) {
      return;
    }
    if (parsed.expiresAt !== undefined && parsed.expiresAt <= Date.now()) {
      this.#cookies.delete(parsed.name);
    } else {
      this.#cookies.set(parsed.name, parsed);
    }
    this.#save();
  }

  /**
   * Build a `Cookie` header value for a request to `path`. Returns empty
   * string when no cookie matches — caller should omit the header entirely
   * in that case (rather than sending `Cookie:` empty).
   */
  cookieHeader(path: string): string {
    const now = Date.now();
    const matches: string[] = [];
    for (const [name, c] of this.#cookies) {
      if (c.expiresAt !== undefined && c.expiresAt <= now) {
        this.#cookies.delete(name);
        continue;
      }
      if (this.#pathMatches(path, c.path)) {
        matches.push(`${c.name}=${c.value}`);
      }
    }
    return matches.join('; ');
  }

  /** Wipe every stored cookie (e.g. on logout). */
  clear(): void {
    this.#cookies.clear();
    this.#save();
  }

  /**
   * RFC 6265 path-match: a request path matches a cookie path if the cookie
   * path is `/`, the request path equals the cookie path exactly, or the
   * cookie path is a prefix terminated by `/`.
   */
  #pathMatches(requestPath: string, cookiePath: string): boolean {
    if (cookiePath === '/' || requestPath === cookiePath) {
      return true;
    }
    if (!requestPath.startsWith(cookiePath)) {
      return false;
    }
    return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/';
  }

  #load(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      const raw = sessionStorage.getItem(this.#storageKey);
      if (!raw) {
        return;
      }
      const arr = JSON.parse(raw) as StoredCookie[];
      const now = Date.now();
      for (const c of arr) {
        if (c.expiresAt === undefined || c.expiresAt > now) {
          this.#cookies.set(c.name, c);
        }
      }
    } catch {
      // Corrupt storage — ignore and start fresh.
    }
  }

  #save(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(this.#storageKey, JSON.stringify([...this.#cookies.values()]));
    } catch {
      // Quota or disabled storage — ignore. Cookies still work in-memory.
    }
  }
}

/**
 * Drop any prior-hub jars from sessionStorage. Called once per CookieJar
 * construction so an old session's cookies cannot persist into a new hub
 * binding within the same tab.
 */
function clearStaleHubJars(activeKey: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX) && k !== activeKey) {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) {
      sessionStorage.removeItem(k);
    }
  } catch {
    /* sessionStorage disabled — nothing to clean */
  }
}
