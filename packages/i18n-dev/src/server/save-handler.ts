import { existsSync, realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { setNestedValue, UnsafeKeyPathError } from '@brika/i18n';
import { detectIndentFromContent } from '@brika/i18n/node';
import type { Connect } from 'vite';
import { z } from 'zod';
import { parseJsonObject } from '../object';

interface Logger {
  info(msg: string, opts?: { timestamp?: boolean }): void;
  error(msg: string, opts?: { timestamp?: boolean }): void;
}

export interface SaveHandlerOptions {
  /** Local `localesDir` to write into. When `null`, all writes route via `apiUrl`. */
  readonly localesDir: string | null;
  /** Hub i18n base URL (e.g. `http://localhost:3001/api/i18n`). Optional. */
  readonly apiUrl: string | null;
  readonly logger: Logger;
}

/**
 * Locale + namespace name validation.
 *
 * The handler accepts a writable JSON payload, then concatenates the values
 * into `${localesDir}/${locale}/${namespace}.json`. Without this gate, a
 * payload `{ locale: '../etc', namespace: 'passwd' }` would escape the
 * locales root entirely. The allow-list mirrors the characters i18next
 * itself permits in namespace identifiers, plus a few safe extras used by
 * common conventions.
 */
const IDENT_RE = /^[A-Za-z0-9_.@:+-]+$/;

// Mirrors the hub-side schema in `apps/hub/src/runtime/http/routes/i18n.ts`.
// The 10 KB ceiling on `value` is the documented limit for translation
// leaves — anything larger almost certainly indicates a runaway client.
const writePayloadSchema = z.object({
  locale: z.string().regex(IDENT_RE, 'invalid locale'),
  namespace: z.string().regex(IDENT_RE, 'invalid namespace'),
  key: z.string().trim().min(1).max(256),
  value: z.string().max(10_000),
});

export type WritePayload = z.infer<typeof writePayloadSchema>;

function sameOriginHost(req: IncomingMessage): string | null {
  const host = req.headers.host;
  return typeof host === 'string' && host.length > 0 ? host : null;
}

function isSameOrigin(req: IncomingMessage): boolean {
  const expected = sameOriginHost(req);
  if (!expected) {
    return false;
  }
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  // State-changing endpoint: require at least one of Origin / Referer. Reject
  // when both are absent — that's the shape of a cross-origin drive-by where
  // neither header is sent (e.g. via Referrer-Policy: no-referrer).
  if (typeof origin !== 'string' && typeof referer !== 'string') {
    return false;
  }
  for (const raw of [origin, referer]) {
    if (typeof raw !== 'string' || raw.length === 0) {
      continue;
    }
    let candidateHost: string;
    try {
      candidateHost = new URL(raw).host;
    } catch {
      return false;
    }
    if (candidateHost !== expected) {
      return false;
    }
  }
  return true;
}

function readBody(req: IncomingMessage, max = 1_000_000): Promise<string> {
  return new Promise((res, rej) => {
    let len = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      len += chunk.length;
      if (len > max) {
        rej(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * Write a single dot-path edit into `${localesDir}/${locale}/${ns}.json`.
 * Caller is responsible for prior schema validation; this function only
 * enforces the path-containment guard via realpath.
 */
async function writeLocal(
  payload: WritePayload,
  localesDir: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const filePath = join(localesDir, payload.locale, `${payload.namespace}.json`);
  if (!existsSync(filePath)) {
    // Resolve the target's parent dir relative to localesDir; if the parent
    // itself doesn't exist, refuse rather than implicitly creating directories
    // outside what the caller already authored.
    return { ok: false, status: 404, error: `${filePath} not found` };
  }
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `cannot resolve ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const realBase = realpathSync(localesDir);
  if (!(real === realBase || real.startsWith(`${realBase}/`))) {
    return { ok: false, status: 403, error: 'resolved path escapes localesDir' };
  }
  const raw = await readFile(real, 'utf-8');
  const json = parseJsonObject(raw);
  if (!json) {
    return { ok: false, status: 500, error: `${real} is not a JSON object` };
  }
  try {
    setNestedValue(json, payload.key, payload.value);
  } catch (err) {
    if (err instanceof UnsafeKeyPathError) {
      return { ok: false, status: 400, error: err.message };
    }
    throw err;
  }
  const indent = detectIndentFromContent(raw);
  await writeFile(real, `${JSON.stringify(json, null, indent)}\n`, 'utf-8');
  return { ok: true };
}

async function writeRemote(
  payload: WritePayload,
  apiUrl: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const url = `${apiUrl}/sources/${encodeURIComponent(payload.namespace)}/${encodeURIComponent(payload.locale)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: payload.key, value: payload.value }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}${detail ? ` — ${detail}` : ''}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Connect middleware exposing `POST /__i18n-write` for the dev overlay.
 *
 * Accepts `{ locale, namespace, key, value }`. Routes the write through the
 * local filesystem when `localesDir` is configured; otherwise forwards to
 * the hub at `${apiUrl}/sources/:ns/:locale`. The same-origin check protects
 * against drive-by writes from foreign sites embedded in the dev server's
 * browser tab.
 */
export function createSaveHandlerMiddleware(
  options: SaveHandlerOptions
): Connect.NextHandleFunction {
  const { localesDir, apiUrl, logger } = options;
  const localesRoot = localesDir ? resolve(localesDir) : null;

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__i18n-write')) {
      next();
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'method not allowed' });
      return;
    }
    if (!isSameOrigin(req)) {
      send(res, 403, { error: 'forbidden' });
      return;
    }

    void (async () => {
      let bodyText: string;
      try {
        bodyText = await readBody(req);
      } catch (err) {
        send(res, 413, { error: err instanceof Error ? err.message : 'read error' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        send(res, 400, { error: 'invalid JSON' });
        return;
      }
      const result = writePayloadSchema.safeParse(parsed);
      if (!result.success) {
        send(res, 400, { error: result.error.issues.map((i) => i.message).join('; ') });
        return;
      }
      const payload = result.data;

      let outcome: { ok: true } | { ok: false; status: number; error: string };
      if (localesRoot) {
        outcome = await writeLocal(payload, localesRoot);
      } else if (apiUrl) {
        outcome = await writeRemote(payload, apiUrl);
      } else {
        outcome = { ok: false, status: 503, error: 'no writer configured' };
      }

      if (outcome.ok) {
        logger.info(`[i18n-dev] saved ${payload.namespace}:${payload.key} [${payload.locale}]`, {
          timestamp: true,
        });
        send(res, 200, { ok: true });
      } else {
        logger.error(`[i18n-dev] save failed: ${outcome.error}`, { timestamp: true });
        send(res, outcome.status, { ok: false, error: outcome.error });
      }
    })();
  };
}
