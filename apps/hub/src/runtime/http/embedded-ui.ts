/**
 * Embedded UI bundle.
 *
 * The hub's compiled binary ships its own copy of `apps/ui/dist` so it can
 * serve the UI without a sidecar directory and without depending on a
 * Cloudflare-hosted bundle that may have drifted. The bytes are loaded into
 * the binary at build time via a Bun macro, gunzipped + untarred on first
 * request, and served straight from memory thereafter.
 *
 * This module is intentionally tiny: one lazy archive load + a Hono
 * middleware that maps request paths to byte arrays with an SPA fallback
 * to `index.html`.
 */

import { loadTarBytes } from '@brika/db/macros' with { type: 'macro' };
import type { Context, MiddlewareHandler, Next } from 'hono';

let cache: Promise<Map<string, Uint8Array>> | null = null;

async function loadArchive(): Promise<Map<string, Uint8Array>> {
  const compressed = new Uint8Array(await loadTarBytes('apps/ui/dist'));
  if (compressed.byteLength === 0) {
    // No dist on disk at build time. Caller's `embeddedUiAvailable()`
    // check should have prevented us getting here; surface explicitly so
    // a buggy caller doesn't silently serve an empty bundle.
    return new Map();
  }
  const tarData = Bun.gunzipSync(compressed);
  const archive = new Bun.Archive(tarData);
  const files = await archive.files();
  const out = new Map<string, Uint8Array>();
  for (const [path, file] of files) {
    out.set(path, await file.bytes());
  }
  return out;
}

function archive(): Promise<Map<string, Uint8Array>> {
  cache ??= loadArchive();
  return cache;
}

/**
 * `true` iff the macro captured at least one file at build time. Lets the
 * caller skip wiring the middleware in builds where the UI wasn't
 * pre-built (rare — `bun run compile` runs the UI build first — but happens
 * during isolated `bun --filter @brika/hub build` runs).
 */
export async function embeddedUiAvailable(): Promise<boolean> {
  return (await archive()).size > 0;
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

function mimeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot === -1) {
    return 'application/octet-stream';
  }
  const ext = path.slice(dot + 1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

/**
 * Hono middleware that serves `GET`/`HEAD` requests outside `/api/*` from
 * the embedded archive. Missing paths fall through to `index.html` so the
 * SPA router can take over.
 */
export function embeddedUi(): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      await next();
      return undefined;
    }
    if (c.req.path.startsWith('/api/')) {
      await next();
      return undefined;
    }

    const files = await archive();
    if (files.size === 0) {
      await next();
      return undefined;
    }

    const requested = c.req.path === '/' ? 'index.html' : c.req.path.replace(/^\/+/, '');
    // SPA fallback for client-side routes (`null` so `??=` works).
    const bytes = files.get(requested) ?? files.get('index.html') ?? null;
    if (!bytes) {
      await next();
      return undefined;
    }
    return c.body(bytes as unknown as ArrayBuffer, 200, {
      'content-type': mimeFor(requested),
      // Vite hashes its assets — long-lived caching is safe for /assets/*.
      ...(requested.startsWith('assets/')
        ? { 'cache-control': 'public, max-age=31536000, immutable' }
        : { 'cache-control': 'no-cache' }),
    });
  };
}
