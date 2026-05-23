/**
 * Bounded body reader. Verifies size capping (streaming abort, not
 * post-buffer rejection), Content-Length short-circuit, and that bodies
 * within the limit decode correctly.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { readBoundedText } from '../body-reader';

function streamResponse(
  chunks: ReadonlyArray<Uint8Array>,
  headers?: Record<string, string>
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

const enc = (s: string) => new TextEncoder().encode(s);

describe('readBoundedText', () => {
  test('reads a body within the limit verbatim', async () => {
    const res = streamResponse([enc('hello world')]);
    expect(await readBoundedText(res, { limit: 100 })).toBe('hello world');
  });

  test('reassembles multi-chunk bodies', async () => {
    const res = streamResponse([enc('foo'), enc(' '), enc('bar')]);
    expect(await readBoundedText(res, { limit: 100 })).toBe('foo bar');
  });

  test('throws NET_BODY_TOO_LARGE when streamed total exceeds limit', async () => {
    const big = enc('x'.repeat(20));
    const res = streamResponse([big]);
    let thrown: BrikaError | undefined;
    try {
      await readBoundedText(res, { limit: 10 });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_BODY_TOO_LARGE');
    expect(thrown?.data).toMatchObject({ limit: 10, received: 20 });
  });

  test('aborts after the limit is crossed mid-stream', async () => {
    // Three chunks of 5 bytes; limit 12 → 1st OK (5), 2nd OK (10), 3rd exceeds (15).
    const res = streamResponse([enc('aaaaa'), enc('bbbbb'), enc('ccccc')]);
    let thrown: BrikaError | undefined;
    try {
      await readBoundedText(res, { limit: 12 });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_BODY_TOO_LARGE');
    expect(thrown?.data).toMatchObject({ limit: 12, received: 15 });
  });

  test('short-circuits via Content-Length: error reports advertised, not streamed, size', async () => {
    // ReadableStream's `start` runs at construction time regardless of
    // whether the body is ever read, so testing "stream wasn't consumed"
    // can't use that hook. Instead we verify the error reports the
    // advertised length (1000), not the body that was actually queued
    // (1 byte) — which proves the short-circuit fired before stream read.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc('x'));
        controller.close();
      },
    });
    const res = new Response(stream, { headers: { 'content-length': '1000' } });
    let thrown: BrikaError | undefined;
    try {
      await readBoundedText(res, { limit: 100 });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_BODY_TOO_LARGE');
    expect(thrown?.data).toMatchObject({ limit: 100, received: 1000 });
  });

  test('ignores garbage Content-Length and streams normally', async () => {
    const res = streamResponse([enc('hello')], { 'content-length': 'banana' });
    expect(await readBoundedText(res, { limit: 100 })).toBe('hello');
  });

  test('handles empty body', async () => {
    const res = new Response(null, { status: 204 });
    expect(await readBoundedText(res, { limit: 100 })).toBe('');
  });

  test('handles UTF-8 multibyte sequences split across chunks', async () => {
    // '🦀' encodes to 4 bytes; split across two chunks.
    const crab = enc('🦀');
    const res = streamResponse([crab.slice(0, 2), crab.slice(2)]);
    expect(await readBoundedText(res, { limit: 100 })).toBe('🦀');
  });
});
