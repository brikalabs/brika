/**
 * Tests for CLI SSE streaming utility
 */

import { describe, expect, test } from 'bun:test';
import { CliError } from '@/cli/errors';
import { streamSseEvents } from '@/cli/utils/sse';

const encoder = new TextEncoder();

/** Create a ReadableStream from an array of string chunks. */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Create a minimal Response with a body from string chunks. */
function sseResponse(chunks: string[]): Response {
  return new Response(chunkedStream(chunks));
}

/** Collect all values from an async generator into an array. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

describe('cli/utils/sse', () => {
  describe('streamSseEvents', () => {
    test('yields parsed JSON objects from SSE data lines', async () => {
      const res = sseResponse(['data: {"type":"start","id":1}\n', 'data: {"type":"end","id":2}\n']);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([
        { type: 'start', id: 1 },
        { type: 'end', id: 2 },
      ]);
    });

    test('ignores non-data lines (event:, id:, retry:, comments)', async () => {
      const res = sseResponse([
        ': this is a comment\n',
        'event: update\n',
        'id: 42\n',
        'retry: 3000\n',
        'data: {"ok":true}\n',
        '\n',
      ]);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([{ ok: true }]);
    });

    test('handles multi-chunk data split across reads', async () => {
      // Single SSE frame split across two chunks
      const res = sseResponse(['data: {"he', 'llo":"world"}\n']);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([{ hello: 'world' }]);
    });

    test('throws CliError when response has no body', async () => {
      const res = new Response();
      // Remove the body by creating an object that looks like a Response but has no body
      const noBodyRes = {
        body: null,
      } as unknown as Response;

      await expect(collect(streamSseEvents(noBodyRes))).rejects.toThrow(CliError);
    });

    test('CliError message mentions no response stream', async () => {
      const noBodyRes = { body: null } as unknown as Response;

      try {
        await collect(streamSseEvents(noBodyRes));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).message).toContain('no response stream');
      }
    });

    test('ignores malformed JSON in data lines', async () => {
      const res = sseResponse([
        'data: {bad json\n',
        'data: {"good":true}\n',
        'data: not-json-at-all\n',
        'data: {"also":"good"}\n',
      ]);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([{ good: true }, { also: 'good' }]);
    });

    test('handles empty stream (done immediately)', async () => {
      const res = sseResponse([]);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([]);
    });

    test('releases reader lock on completion', async () => {
      const res = sseResponse(['data: {"a":1}\n']);

      // Consume the generator fully
      await collect(streamSseEvents(res));

      // After release, we should be able to get a new reader without error.
      // If releaseLock was not called, getReader() would throw.
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();
      reader?.releaseLock();
    });

    test('releases reader lock on early break', async () => {
      const res = sseResponse(['data: {"a":1}\n', 'data: {"a":2}\n', 'data: {"a":3}\n']);

      const gen = streamSseEvents(res);
      // Read only the first event then break
      const first = await gen.next();
      expect(first.value).toEqual({ a: 1 });
      // Force generator return (simulates break in for-await)
      await gen.return(undefined);

      // Reader lock should be released
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();
      reader?.releaseLock();
    });

    test('handles buffered incomplete lines across chunks', async () => {
      // Line split in the middle: "data: " in one chunk, JSON in next
      const res = sseResponse(['data: {"x":1}\ndat', 'a: {"x":2}\ndata: {"x"', ':3}\n']);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
    });

    test('handles multiple data lines in a single chunk', async () => {
      const res = sseResponse(['data: {"a":1}\ndata: {"b":2}\ndata: {"c":3}\n']);

      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });

    test('yields typed events with generic parameter', async () => {
      interface MyEvent {
        type: string;
        payload: number;
      }

      const res = sseResponse(['data: {"type":"test","payload":42}\n']);

      const events = await collect(streamSseEvents<MyEvent>(res));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('test');
      expect(events[0].payload).toBe(42);
    });

    test('handles data lines with extra whitespace in payload', async () => {
      const res = sseResponse(['data:  {"spaced":true}\n']);

      // "data: " is 6 chars, so "data:  {" means the parsed string starts with " {"
      // which is still valid JSON (leading space before object)
      const events = await collect(streamSseEvents(res));

      expect(events).toEqual([{ spaced: true }]);
    });

    test('skips lines that are only "data:" without space prefix', async () => {
      const res = sseResponse(['data:{"no_space":true}\n', 'data: {"with_space":true}\n']);

      const events = await collect(streamSseEvents(res));

      // "data:{" does not start with "data: " so it is skipped
      expect(events).toEqual([{ with_space: true }]);
    });
  });
});
