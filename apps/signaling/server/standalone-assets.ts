/**
 * Filesystem-backed asset Fetcher for the standalone signaling server.
 *
 * Mirrors what CF's `ASSETS` binding does in production:
 *   - Serves files from `dir` with a `Content-Type` inferred from extension.
 *   - SPA fallback: unknown paths return `dir/index.html` with the same body.
 *
 * Runtime detection picks `Bun.file` / `node:fs/promises` so the same code
 * runs on Bun, Node, and Deno. The Hono router stamps `injectHubMeta` on
 * HTML responses — done outside this module by the caller — so per-hub
 * `<meta name="brika:hub">` reaches the bootstrap exactly like CF does.
 */

import { extname, normalize, resolve, sep } from 'node:path';

interface FileLoader {
  readFile(absPath: string): Promise<Uint8Array | null>;
}

interface AssetsFetcher {
  fetch(req: Request): Promise<Response>;
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

async function makeLoader(): Promise<FileLoader> {
  if ('Bun' in globalThis) {
    const Bun = (globalThis as unknown as { Bun: typeof import('bun') }).Bun;
    return {
      async readFile(absPath) {
        const file = Bun.file(absPath);
        if (!(await file.exists())) {
          return null;
        }
        return new Uint8Array(await file.arrayBuffer());
      },
    };
  }
  const fs = await import('node:fs/promises');
  return {
    async readFile(absPath) {
      try {
        const buf = await fs.readFile(absPath);
        return new Uint8Array(buf);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    },
  };
}

/**
 * Returns a Fetcher that serves files from `dir` with SPA fallback. The
 * loader is selected once and held — no per-request runtime detection.
 */
export async function createFilesystemAssets(dir: string): Promise<AssetsFetcher> {
  const root = resolve(dir);
  const loader = await makeLoader();
  const indexHtml = `${root}${sep}index.html`;

  return {
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      const requested = url.pathname === '/' ? '/index.html' : url.pathname;
      const safeAbs = safeJoin(root, requested);
      if (!safeAbs) {
        return new Response('Not found', { status: 404 });
      }
      let bytes = await loader.readFile(safeAbs);
      let path = requested;
      if (!bytes) {
        bytes = await loader.readFile(indexHtml);
        if (!bytes) {
          return new Response('Not found', { status: 404 });
        }
        path = '/index.html';
      }
      // Type-cast to BodyInit-compatible — Uint8Array implements ArrayBufferView.
      const body: BodyInit = bytes;
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': mimeFor(path) },
      });
    },
  };
}

/**
 * Resolve a request path to an absolute file path under `root`, rejecting
 * any traversal that escapes the root. Returns `null` on rejection.
 */
function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  const normalised = normalize(decoded);
  // Reject `..` after normalisation and any backslashes (Windows-style) that
  // sneak past a Linux-only `normalize`.
  if (normalised.includes('..') || normalised.includes('\\')) {
    return null;
  }
  const abs = resolve(root, normalised.replace(/^\/+/, ''));
  if (!abs.startsWith(root + sep) && abs !== root) {
    return null;
  }
  return abs;
}
