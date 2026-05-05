/**
 * Cookie jar + redirect-following fetch helper.
 *
 * Bun's `fetch` with `redirect: 'follow'` skips intermediate `Set-Cookie`
 * headers, but the SIL auth chain depends on cookies set during redirects
 * (token_F5, MRHSession, …). `fetchAndIngest` follows redirects manually so
 * the jar captures every hop.
 */

export class CookieJar {
  private readonly map = new Map<string, string>();

  ingest(res: Response): void {
    res.headers.forEach((header, name) => {
      if (name.toLowerCase() !== 'set-cookie') return;
      this.#parseSetCookie(header);
    });
  }

  #parseSetCookie(header: string): void {
    const parts = header.split(';').map((p) => p.trim());
    const head = parts[0];
    if (!head) return;
    const eq = head.indexOf('=');
    if (eq <= 0) return;

    const key = head.slice(0, eq).trim();
    const value = head.slice(eq + 1).trim();

    // cgu/check explicitly clears token_F5 with `Expires=Thu, 01 Jan 1970…`.
    // Honor that, otherwise we keep sending a stale "deleted" value to my.policy.
    const expires = parts.find((p) => p.toLowerCase().startsWith('expires='));
    if (expires) {
      const ts = Date.parse(expires.slice('expires='.length).trim());
      if (Number.isFinite(ts) && ts < Date.now()) {
        this.map.delete(key);
        return;
      }
    }
    const maxAge = parts.find((p) => p.toLowerCase().startsWith('max-age='));
    if (maxAge && Number(maxAge.slice('max-age='.length).trim()) <= 0) {
      this.map.delete(key);
      return;
    }

    this.map.set(key, value);
  }

  toString(): string {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  names(): string {
    return [...this.map.keys()].join(', ');
  }

  /** Return the first cookie value that looks like an SSO token (80+ base64 chars). */
  ssoCandidate(): string | null {
    for (const value of this.map.values()) {
      if (/^[A-Za-z0-9+/]{80,}={0,2}$/.test(value)) return value;
    }
    return null;
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * Fetch with manual redirect following so we collect Set-Cookie headers from
 * every hop. Use `redirect: 'follow'` to follow up to 10 redirects, or
 * `redirect: 'manual'` for a single request.
 */
export async function fetchAndIngest(
  jar: CookieJar,
  url: string,
  init: RequestInit & { redirect?: 'follow' | 'manual' } = {},
): Promise<Response> {
  const max = 10;
  let current = url;
  let method = init.method ?? 'GET';
  let body = init.body;
  const baseHeaders = { ...(init.headers as Record<string, string>) };
  const followRedirects = (init.redirect ?? 'manual') === 'follow';

  for (let i = 0; i <= max; i++) {
    const headers: Record<string, string> = { ...baseHeaders };
    headers['Cookie'] = jar.toString();
    const res = await fetch(current, { ...init, method, body, headers, redirect: 'manual' });
    jar.ingest(res);

    if (!followRedirects) return res;
    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get('location');
    if (!location) return res;

    current = location.startsWith('http') ? location : new URL(location, current).href;
    // 303, or POST with 301/302, becomes GET per HTTP spec
    if (res.status === 303 || (method === 'POST' && (res.status === 301 || res.status === 302))) {
      method = 'GET';
      body = undefined;
      delete baseHeaders['Content-Type'];
      delete baseHeaders['Content-Length'];
    }
    await res.body?.cancel();
  }
  throw new Error('TOO_MANY_REDIRECTS');
}
