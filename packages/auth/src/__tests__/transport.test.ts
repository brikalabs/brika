import { describe, expect, it } from 'bun:test';
import { ConnectionTypeSchema } from '../schemas';
import { parseTransportHeader, TRANSPORT_HEADER } from '../types';

describe('TRANSPORT_HEADER', () => {
  it('is the canonical "x-brika-transport" header name', () => {
    expect(TRANSPORT_HEADER).toBe('x-brika-transport');
  });
});

describe('parseTransportHeader', () => {
  it('returns "rtc" for "rtc"', () => {
    expect(parseTransportHeader('rtc')).toBe('rtc');
  });

  it('returns "ws" for "ws"', () => {
    expect(parseTransportHeader('ws')).toBe('ws');
  });

  it('returns "http" for "http"', () => {
    expect(parseTransportHeader('http')).toBe('http');
  });

  it('defaults to "http" for null / undefined / empty', () => {
    expect(parseTransportHeader(null)).toBe('http');
    expect(parseTransportHeader(undefined)).toBe('http');
    expect(parseTransportHeader('')).toBe('http');
  });

  it('defaults to "http" for any unknown value', () => {
    // Defence-in-depth: header is attacker-controllable, must never bypass
    // the enum constraint even if a future deployment forwards weird values.
    expect(parseTransportHeader('sneaky')).toBe('http');
    expect(parseTransportHeader('RTC')).toBe('http'); // case-sensitive
    expect(parseTransportHeader('rtc; drop table users')).toBe('http');
  });
});

describe('ConnectionTypeSchema', () => {
  it('accepts the three valid values', () => {
    for (const v of ['http', 'rtc', 'ws']) {
      expect(ConnectionTypeSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const v of ['HTTP', 'tcp', '', null, undefined, 42]) {
      expect(ConnectionTypeSchema.safeParse(v).success).toBe(false);
    }
  });
});
