/**
 * Tests for the IPC payload-size guard: measurement + Channel enforcement on
 * both outbound `send` and inbound `handle`.
 */

import { describe, expect, mock, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { z } from 'zod';
import {
  Channel,
  DEFAULT_MAX_PAYLOAD_BYTES,
  type PayloadLimitDirection,
  type WireMessage,
} from './channel';
import { message, rpc } from './define';
import { measurePayloadBytes } from './payload-size';

const blob = message('blob', z.object({ data: z.unknown() }));
const echo = rpc('echo', z.object({ data: z.unknown() }), z.object({ ok: z.boolean() }));

interface Captured {
  sent: WireMessage[];
  rejections: { error: BrikaError; direction: PayloadLimitDirection }[];
}

function makeChannel(maxPayloadBytes: number): { channel: Channel; captured: Captured } {
  const captured: Captured = { sent: [], rejections: [] };
  const channel = new Channel({
    send: (msg) => captured.sent.push(msg),
    maxPayloadBytes,
    onPayloadLimitExceeded: (error, direction) => captured.rejections.push({ error, direction }),
  });
  return { channel, captured };
}

describe('measurePayloadBytes', () => {
  test('counts binary via byteLength without stringify', () => {
    const big = new Uint8Array(1000);
    const size = measurePayloadBytes({ t: 'blob', data: big }, Number.POSITIVE_INFINITY);
    expect(size).toBeGreaterThanOrEqual(1000);
  });

  test('ArrayBuffer is measured by byteLength', () => {
    const buf = new ArrayBuffer(2048);
    const size = measurePayloadBytes({ t: 'blob', data: buf }, Number.POSITIVE_INFINITY);
    expect(size).toBeGreaterThanOrEqual(2048);
  });

  test('strings are counted (upper-bounded)', () => {
    const size = measurePayloadBytes(
      { t: 'blob', data: 'x'.repeat(500) },
      Number.POSITIVE_INFINITY
    );
    expect(size).toBeGreaterThanOrEqual(500);
  });

  test('short-circuits past the limit (returns >= limit)', () => {
    const huge = 'x'.repeat(10_000);
    const size = measurePayloadBytes({ t: 'blob', data: huge }, 100);
    expect(size).toBeGreaterThan(100);
  });

  test('handles cycles without infinite recursion', () => {
    const obj: Record<string, unknown> = { t: 'blob' };
    obj.self = obj;
    expect(() => measurePayloadBytes(obj, 10_000)).not.toThrow();
  });

  test('measures Map and Set members', () => {
    const map = new Map([['k', 'v'.repeat(300)]]);
    const set = new Set(['s'.repeat(300)]);
    expect(measurePayloadBytes({ map }, Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(300);
    expect(measurePayloadBytes({ set }, Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(300);
  });

  test('measures array members', () => {
    const arr = ['a'.repeat(200), 'b'.repeat(200)];
    expect(measurePayloadBytes({ arr }, Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(400);
  });

  test('short-circuits inside an oversized array without walking all members', () => {
    const arr = Array.from({ length: 50 }, () => 'x'.repeat(1000));
    const size = measurePayloadBytes(arr, 100);
    expect(size).toBe(Number.POSITIVE_INFINITY);
  });

  test('counts null and undefined as fixed-overhead nodes', () => {
    const withNullish = measurePayloadBytes({ a: null, b: undefined }, Number.POSITIVE_INFINITY);
    const empty = measurePayloadBytes({}, Number.POSITIVE_INFINITY);
    expect(withNullish).toBeGreaterThan(empty);
  });

  test('counts bigint by its decimal-string length', () => {
    const small = measurePayloadBytes({ n: 1n }, Number.POSITIVE_INFINITY);
    const large = measurePayloadBytes(
      { n: 123_456_789_012_345_678_901_234_567_890n },
      Number.POSITIVE_INFINITY
    );
    expect(large).toBeGreaterThan(small);
  });

  test('counts primitive scalars (boolean/number) as fixed overhead', () => {
    const withScalars = measurePayloadBytes({ a: true, b: 42 }, Number.POSITIVE_INFINITY);
    const empty = measurePayloadBytes({}, Number.POSITIVE_INFINITY);
    expect(withScalars).toBeGreaterThan(empty);
  });

  test('Date is measured as a tagged fixed-size value', () => {
    const size = measurePayloadBytes({ at: new Date(0) }, Number.POSITIVE_INFINITY);
    expect(size).toBeGreaterThan(0);
  });

  test('over-limit Map short-circuits', () => {
    const map = new Map([['k', 'v'.repeat(10_000)]]);
    expect(measurePayloadBytes(map, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Channel payload guard — outbound send', () => {
  test('under-limit message is forwarded', () => {
    const { channel, captured } = makeChannel(10_000);
    channel.send(blob, { data: 'small' });
    expect(captured.sent).toHaveLength(1);
    expect(captured.rejections).toHaveLength(0);
  });

  test('over-limit message is rejected, not forwarded', () => {
    const { channel, captured } = makeChannel(100);
    channel.send(blob, { data: 'x'.repeat(10_000) });
    expect(captured.sent).toHaveLength(0);
    expect(captured.rejections).toHaveLength(1);
    expect(captured.rejections[0]?.direction).toBe('send');
  });

  test('rejection carries a typed IPC_PAYLOAD_TOO_LARGE error', () => {
    const { channel, captured } = makeChannel(100);
    channel.send(blob, { data: new Uint8Array(10_000) });
    const err = captured.rejections[0]?.error;
    expect(err).toBeInstanceOf(BrikaError);
    expect(BrikaError.is(err, 'IPC_PAYLOAD_TOO_LARGE')).toBe(true);
    expect(err?.data?.direction).toBe('send');
    expect(err?.data?.messageType).toBe('blob');
    expect(err?.data?.limit).toBe(100);
  });

  test('over-limit RPC call rejects the returned promise', async () => {
    const { channel } = makeChannel(100);
    await expect(channel.call(echo, { data: 'x'.repeat(10_000) }, 0)).rejects.toThrow();
    let caught: unknown;
    try {
      await channel.call(echo, { data: 'x'.repeat(10_000) }, 0);
    } catch (e) {
      caught = e;
    }
    expect(BrikaError.is(caught, 'IPC_PAYLOAD_TOO_LARGE')).toBe(true);
  });

  test('binary fast path is not regressed for under-limit blobs', () => {
    const { channel, captured } = makeChannel(DEFAULT_MAX_PAYLOAD_BYTES);
    const payload = new Uint8Array(64 * 1024);
    channel.send(blob, { data: payload });
    expect(captured.sent).toHaveLength(1);
    expect(captured.sent[0]?.data).toBe(payload);
  });

  test('a message exactly at the limit is forwarded (boundary)', () => {
    // Measure a known payload, then set the cap to exactly its size.
    const msg = { t: 'blob', data: 'x'.repeat(200) };
    const exact = measurePayloadBytes(msg, Number.POSITIVE_INFINITY);
    const { channel, captured } = makeChannel(exact);
    channel.send(blob, { data: 'x'.repeat(200) });
    expect(captured.sent).toHaveLength(1);
    expect(captured.rejections).toHaveLength(0);
  });

  test('one byte over the limit is rejected (boundary)', () => {
    const msg = { t: 'blob', data: 'x'.repeat(200) };
    const exact = measurePayloadBytes(msg, Number.POSITIVE_INFINITY);
    const { channel, captured } = makeChannel(exact - 1);
    channel.send(blob, { data: 'x'.repeat(200) });
    expect(captured.sent).toHaveLength(0);
    expect(captured.rejections).toHaveLength(1);
  });

  test('send on a closed channel is a no-op (not measured/forwarded)', () => {
    const { channel, captured } = makeChannel(10_000);
    channel.close();
    channel.send(blob, { data: 'small' });
    expect(captured.sent).toHaveLength(0);
    expect(captured.rejections).toHaveLength(0);
  });

  test('default cap (no maxPayloadBytes) leaves normal traffic untouched', () => {
    const captured: WireMessage[] = [];
    const channel = new Channel({ send: (msg) => captured.push(msg) });
    channel.send(blob, { data: 'x'.repeat(1000) });
    expect(captured).toHaveLength(1);
  });

  test('over-limit send without an onPayloadLimitExceeded callback still drops the message', () => {
    const sent: WireMessage[] = [];
    const channel = new Channel({ send: (msg) => sent.push(msg), maxPayloadBytes: 100 });
    expect(() => channel.send(blob, { data: 'x'.repeat(10_000) })).not.toThrow();
    expect(sent).toHaveLength(0);
  });
});

describe('Channel payload guard — inbound handle', () => {
  test('under-limit inbound message is handled', async () => {
    const { channel, captured } = makeChannel(10_000);
    const handler = mock(() => undefined);
    channel.on(blob, handler);
    await channel.handle({ t: 'blob', data: 'small' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(captured.rejections).toHaveLength(0);
  });

  test('over-limit inbound message is rejected, handler not called', async () => {
    const { channel, captured } = makeChannel(100);
    const handler = mock(() => undefined);
    channel.on(blob, handler);
    await channel.handle({ t: 'blob', data: 'x'.repeat(10_000) });
    expect(handler).not.toHaveBeenCalled();
    expect(captured.rejections).toHaveLength(1);
    expect(captured.rejections[0]?.direction).toBe('handle');
    expect(BrikaError.is(captured.rejections[0]?.error, 'IPC_PAYLOAD_TOO_LARGE')).toBe(true);
  });
});

describe('default cap', () => {
  test('is generous (>= 1 MiB) so LAN/dev does not break', () => {
    expect(DEFAULT_MAX_PAYLOAD_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
  });
});
