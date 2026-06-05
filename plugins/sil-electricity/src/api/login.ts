/**
 * Email + password login against the SIL portal.
 *
 * Six-step ForgeRock/F5 BIG-IP APM dance:
 *   1. GET the protected resource → follow to my.policy → returns a
 *      SecurityDevice handshake form.
 *   2. POST the handshake to login.html → registers our session with F5 APM
 *      as a trusted browser. Without this, every later request to my.policy
 *      is rejected with errorcode=19.
 *   3. POST credentials to frag/login/confirm (XHR-style).
 *   4. GET cgu/check → returns an HTML form containing the SSO token.
 *   5. POST that token to my.policy → 302 to the protected resource.
 *   6. Follow that redirect to collect any remaining session cookies.
 */

import { CookieJar, fetchAndIngest } from './cookies';
import { AuthError, RateLimitError } from './errors';
import { BASE, GOTO, IAM, timedFetch } from './internals';

/**
 * Optional per-step logger so the 6-step flow is debuggable without coupling
 * this pure API layer to the SDK runtime. `auth.ts` injects the plugin logger;
 * standalone callers (tests, probes) omit it and get a no-op.
 */
export type StepLog = (message: string, meta?: Record<string, unknown>) => void;
const noStepLog: StepLog = () => undefined;

/** Headers that exactly match Chrome's working HAR for the auth chain. */
const NAV_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'fr-CH,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="147", "Not.A/Brand";v="8"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-ch-ua-platform-version': '"26.5.0"',
};

const GOTO_ENC = encodeURIComponent(GOTO);

export async function silLogin(
  email: string,
  password: string,
  onStep: StepLog = noStepLog
): Promise<string> {
  const jar = new CookieJar();

  // Each step logs at debug so a mid-handshake failure shows exactly how far the
  // F5/APM dance got. Cookie names are safe to log; values are not logged.
  await openSecurityDeviceSession(jar);
  onStep('SIL step 1-2: handshake done', { cookies: jar.names() });

  await postCredentials(jar, email, password);
  onStep('SIL step 3: credentials accepted (202)');

  const ssoToken = await fetchSsoToken(jar);
  onStep('SIL step 4: SSO token obtained', { length: ssoToken.length });

  await submitSsoToken(jar, ssoToken);
  onStep('SIL step 5-6: policy submitted', { cookies: jar.names() });

  if (jar.size === 0) {
    throw new AuthError('AUTH_NO_COOKIE');
  }
  return jar.toString();
}

/**
 * Steps 1-2: warm up the F5 session and POST the SecurityDevice handshake
 * so the policy agent recognises us as a navigation-driven client.
 */
async function openSecurityDeviceSession(jar: CookieJar): Promise<void> {
  // Hit the protected page; F5 redirects to my.policy which serves a tiny HTML
  // form whose script auto-submits to login.html with client_data=SecurityDevice.
  const warmup = await fetchAndIngest(jar, `${BASE}${GOTO}`, {
    headers: NAV_HEADERS,
    redirect: 'follow',
  });

  const handshake = await fetchAndIngest(jar, `${IAM}/login.html?goto=${GOTO_ENC}`, {
    method: 'POST',
    headers: {
      ...NAV_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
      Referer: `${BASE}/my.policy`,
    },
    body: new URLSearchParams({
      client_data: 'SecurityDevice',
      post_url: `${BASE}/my.policy`,
    }),
    redirect: 'follow',
  });

  // The handshake's only job is to register F5/APM session cookies (token_F5,
  // MRHSession, etc.). If none landed, the policy agent rejects every later
  // request and the credential POST comes back non-202, which would otherwise
  // surface misleadingly as a credentials failure. Fail with the real cause.
  if (jar.size === 0) {
    throw new AuthError(
      `handshake set no session cookies (warmup=${warmup.status}, handshake=${handshake.status})`
    );
  }
}

/** Step 3: validate credentials. The browser does this as an XHR. */
async function postCredentials(jar: CookieJar, email: string, password: string): Promise<void> {
  const r = await timedFetch(`${IAM}/frag/login/confirm`, {
    method: 'POST',
    headers: {
      'User-Agent': NAV_HEADERS['User-Agent'],
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      Origin: BASE,
      Referer: `${IAM}/login.html?goto=${GOTO_ENC}`,
      Cookie: jar.toString(),
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ email, pwd: password, goto: GOTO }),
    redirect: 'manual',
  });
  jar.ingest(r);

  if (r.status !== 202) {
    const body = await r.text().catch(() => '');
    // A CAPTCHA / verification-code challenge means the portal is rate-limiting
    // us after too many attempts, not that the credentials are wrong. Signal it
    // distinctly so the caller backs off instead of hammering the login.
    if (/captcha|v[eé]rification/i.test(body)) {
      throw new RateLimitError(`captcha challenge (HTTP ${r.status})`);
    }
    // Otherwise surface status + body snippet so a 401 (bad creds) is
    // distinguishable from a 302/403 (handshake or flow drift) in the log.
    throw new AuthError(
      `credentials POST returned HTTP ${r.status}${body ? `: ${body.slice(0, 200)}` : ''}`
    );
  }
  // Drain the JSON body so the connection can be reused.
  await r.json().catch(() => null);
}

/** Step 4: fetch cgu/check and extract the SSO token from its HTML form. */
async function fetchSsoToken(jar: CookieJar): Promise<string> {
  const r = await timedFetch(`${IAM}/cgu/check?goto=${GOTO_ENC}`, {
    headers: {
      ...NAV_HEADERS,
      'Sec-Fetch-User': '?1',
      Cookie: jar.toString(),
      Referer: `${IAM}/login.html?goto=${GOTO_ENC}`,
    },
    redirect: 'manual',
  });
  jar.ingest(r);

  const html = await r.text().catch(() => '');
  const token = extractSsoFromHtml(html) ?? jar.ssoCandidate();
  if (!token) {
    throw new AuthError('AUTH_NO_TOKEN');
  }
  return token;
}

/**
 * Steps 5-6: submit the SSO token to my.policy and follow the redirect to
 * the protected page so we collect every remaining session cookie.
 */
async function submitSsoToken(jar: CookieJar, ssoToken: string): Promise<void> {
  const body = new URLSearchParams();
  body.append('username', ssoToken);
  // Field name is literally 'password  value=' (spaces + =); URLSearchParams encodes correctly.
  body.append('password  value=', '');

  const r = await timedFetch(`${BASE}/my.policy`, {
    method: 'POST',
    headers: {
      ...NAV_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.toString(),
      Origin: BASE,
      Referer: `${IAM}/cgu/check?goto=${GOTO_ENC}`,
    },
    body,
    redirect: 'manual',
  });
  jar.ingest(r);

  const location = r.headers.get('location') ?? '';
  if (location.includes('errorcode') || location.includes('logout')) {
    throw new AuthError(`AUTH_POLICY_DENIED: ${location}`);
  }

  if (location) {
    const nextUrl = location.startsWith('/') ? `${BASE}${location}` : location;
    await fetchAndIngest(jar, nextUrl, {
      headers: { ...NAV_HEADERS, Referer: `${BASE}/my.policy` },
      redirect: 'manual',
    });
  }
}

function extractSsoFromHtml(html: string): string | null {
  // <input ... name="username" ... value="TOKEN" ...>  (any attribute order, single or double quotes)
  const m =
    /name=["']username["'][^>]*value=["']([^"']{20,})["']/i.exec(html) ??
    /value=["']([^"']{20,})["'][^>]*name=["']username["']/i.exec(html);
  return m?.[1] ?? null;
}
