import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFilesystemAssets } from './standalone-assets';

const TMP = `/tmp/brika-assets-test-${process.pid}`;

let fetcher: { fetch: (req: Request) => Promise<Response> };

beforeAll(async () => {
  await mkdir(`${TMP}/assets`, { recursive: true });
  await writeFile(`${TMP}/index.html`, '<!doctype html><body>SHELL</body>');
  await writeFile(`${TMP}/assets/app.js`, 'console.log("brika");');
  await writeFile(`${TMP}/assets/style.css`, 'body{color:#000}');
  await writeFile(`${TMP}/favicon.svg`, '<svg></svg>');
  await writeFile(`${TMP}/icon.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fetcher = await createFilesystemAssets(TMP);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

function get(path: string): Promise<Response> {
  return fetcher.fetch(new Request(`https://hub.brika.dev${path}`));
}

describe('createFilesystemAssets', () => {
  it('serves index.html for /', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('SHELL');
  });

  it('serves a hashed asset with the right MIME', async () => {
    const res = await get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(await res.text()).toContain('console.log');
  });

  it('serves CSS with text/css', async () => {
    const res = await get('/assets/style.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
  });

  it('serves SVG with image/svg+xml', async () => {
    const res = await get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('serves PNG with image/png', async () => {
    const res = await get('/icon.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('falls back to index.html for unknown paths (SPA fallback)', async () => {
    const res = await get('/some/route/the/spa/owns');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('SHELL');
  });

  it('rejects traversal attempts (e.g. /../) with 404 or fallback', async () => {
    // The safeJoin guard either rejects (null → 404) or falls through to
    // SPA fallback; either way it must NEVER serve files outside `dir`.
    const writeOutside = `/tmp/brika-assets-test-outside-${process.pid}.txt`;
    await writeFile(writeOutside, 'SECRET');
    try {
      const res = await fetcher.fetch(
        new Request(`https://hub.brika.dev/${encodeURIComponent('..')}/${'outside'}.txt`)
      );
      const body = await res.text();
      expect(body).not.toContain('SECRET');
    } finally {
      await rm(writeOutside, { force: true });
    }
  });

  it('returns 404 when the SPA fallback file is also missing', async () => {
    // Empty dir → no index.html → unknown path → 404.
    const empty = `/tmp/brika-assets-empty-${process.pid}`;
    await mkdir(empty, { recursive: true });
    try {
      const emptyFetcher = await createFilesystemAssets(empty);
      const res = await emptyFetcher.fetch(new Request('https://hub.brika.dev/nope'));
      expect(res.status).toBe(404);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
