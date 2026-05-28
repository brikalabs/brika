/**
 * Direct tests for `downloadFile` — the resume-capable archive
 * downloader used by `applyUpdate`. Four observable branches:
 *
 *   - no existing partial → standard fetch + write
 *   - existing partial == totalBytes → skip the network, hit 100%
 *   - existing partial < totalBytes → send Range header; 206 appends
 *   - existing partial but server returns 200 (no resume support) →
 *     truncate before writing
 *
 * The progress callback drives the stream-with-progress path
 * (`streamResponseToFile`), which we exercise by passing one.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realFetch } from '@brika/testing';
import { downloadFile } from '@/updater';

let dir: string;
let mockFetch: ReturnType<typeof mock>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'brika-dl-'));
  mockFetch = mock<typeof fetch>();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});

function bodyStream(chunks: ReadonlyArray<Uint8Array>): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[i];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      i += 1;
    },
  });
}

describe('downloadFile', () => {
  test('plain download with progress writes the full payload', async () => {
    const payload = new Uint8Array(8192).fill(0xab);
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(bodyStream([payload]), {
          status: 200,
          headers: { 'Content-Length': String(payload.byteLength) },
        })
      )
    );

    const dest = join(dir, 'a.bin');
    const progress: number[] = [];
    await downloadFile('https://x/a', dest, payload.byteLength, (pct) => progress.push(pct));

    const out = readFileSync(dest);
    expect(out.byteLength).toBe(payload.byteLength);
    expect(progress.at(-1)).toBe(100);
  });

  test('skips the network when the existing partial matches totalBytes', async () => {
    const payload = 'already-here';
    const dest = join(dir, 'a.bin');
    writeFileSync(dest, payload);

    const progress: number[] = [];
    await downloadFile('https://x/a', dest, payload.length, (pct) => progress.push(pct));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(progress).toEqual([100]);
    expect(readFileSync(dest, 'utf8')).toBe(payload);
  });

  test('sends Range header and appends on 206 (resume)', async () => {
    const head = Buffer.from('partial-');
    const tail = Buffer.from('rest');
    const dest = join(dir, 'a.bin');
    writeFileSync(dest, head);

    let seenInit: RequestInit | undefined;
    mockFetch.mockImplementation((_url, init) => {
      seenInit = init;
      return Promise.resolve(
        new Response(bodyStream([new Uint8Array(tail)]), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${head.length}-${head.length + tail.length - 1}/${head.length + tail.length}`,
          },
        })
      );
    });

    const progress: number[] = [];
    await downloadFile('https://x/a', dest, head.length + tail.length, (pct) => progress.push(pct));

    const range = new Headers(seenInit?.headers).get('Range');
    expect(range).toBe(`bytes=${head.length}-`);
    expect(readFileSync(dest, 'utf8')).toBe('partial-rest');
  });

  test('truncates stale partial when server returns 200 (no resume support)', async () => {
    const stalePartial = 'STALE-DATA-FROM-PREVIOUS-ATTEMPT';
    const fresh = Buffer.from('fresh-body');
    const dest = join(dir, 'a.bin');
    writeFileSync(dest, stalePartial);

    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(bodyStream([new Uint8Array(fresh)]), {
          status: 200,
          headers: { 'Content-Length': String(fresh.byteLength) },
        })
      )
    );

    const progress: number[] = [];
    await downloadFile(
      'https://x/a',
      dest,
      stalePartial.length + 99, // totalBytes > partial → triggers Range header
      (pct) => progress.push(pct)
    );

    // Result must be exactly the fresh body, not stale ++ fresh.
    expect(readFileSync(dest, 'utf8')).toBe('fresh-body');
  });

  test('throws on a non-OK / non-206 response', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response('boom', { status: 500, statusText: 'Internal Server Error' }))
    );

    await expect(downloadFile('https://x/a', join(dir, 'a.bin'), 100)).rejects.toThrow(
      /Download failed: 500/
    );
  });

  test('no progress callback → uses the simpler Bun.write path', async () => {
    const payload = 'xyz';
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(payload, {
          status: 200,
          headers: { 'Content-Length': String(payload.length) },
        })
      )
    );

    const dest = join(dir, 'a.bin');
    // No progress callback + totalBytes 0 → simple write path.
    await downloadFile('https://x/a', dest, 0);
    expect(readFileSync(dest, 'utf8')).toBe('xyz');
  });
});
