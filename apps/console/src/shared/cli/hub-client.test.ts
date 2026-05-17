/**
 * Unit tests for the loopback hub HTTP client — URL composition, fetch
 * wrapper, and `hubFetchOk`'s `CliError` wrapping. `requireRunningHub`
 * needs a real pid file and supervisor and is covered elsewhere.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useBunMock } from '@brika/testing';
import { CliError } from './errors';
import { hubFetch, hubFetchOk, hubUrl } from './hub-client';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe('hubUrl', () => {
  let originalHost: string | undefined;
  let originalPort: string | undefined;

  beforeEach(() => {
    originalHost = process.env.BRIKA_HOST;
    originalPort = process.env.BRIKA_PORT;
    delete process.env.BRIKA_HOST;
    delete process.env.BRIKA_PORT;
  });

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.BRIKA_HOST;
    } else {
      process.env.BRIKA_HOST = originalHost;
    }
    if (originalPort === undefined) {
      delete process.env.BRIKA_PORT;
    } else {
      process.env.BRIKA_PORT = originalPort;
    }
  });

  test('defaults to 127.0.0.1:3001', () => {
    expect(hubUrl()).toBe('http://127.0.0.1:3001');
  });

  test('honours the explicit port argument over the env var', () => {
    process.env.BRIKA_PORT = '9999';
    expect(hubUrl(4242)).toBe('http://127.0.0.1:4242');
  });

  test('honours BRIKA_HOST', () => {
    process.env.BRIKA_HOST = '10.0.0.5';
    expect(hubUrl()).toBe('http://10.0.0.5:3001');
  });

  test('honours BRIKA_PORT', () => {
    process.env.BRIKA_PORT = '5555';
    expect(hubUrl()).toBe('http://127.0.0.1:5555');
  });

  test('honours both BRIKA_HOST and BRIKA_PORT together', () => {
    process.env.BRIKA_HOST = '192.168.1.10';
    process.env.BRIKA_PORT = '7000';
    expect(hubUrl()).toBe('http://192.168.1.10:7000');
  });
});

describe('hubFetch', () => {
  const bun = useBunMock();
  let home: string;
  let originalHome: string | undefined;
  let originalHost: string | undefined;
  let originalPort: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-hub-client-'));
    originalHome = process.env.BRIKA_HOME;
    originalHost = process.env.BRIKA_HOST;
    originalPort = process.env.BRIKA_PORT;
    process.env.BRIKA_HOME = home;
    delete process.env.BRIKA_HOST;
    delete process.env.BRIKA_PORT;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = originalHome;
    }
    if (originalHost === undefined) {
      delete process.env.BRIKA_HOST;
    } else {
      process.env.BRIKA_HOST = originalHost;
    }
    if (originalPort === undefined) {
      delete process.env.BRIKA_PORT;
    } else {
      process.env.BRIKA_PORT = originalPort;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test('GETs the hub URL with the given path', async () => {
    let seenUrl = '';
    let seenMethod = '';
    bun.fetch(async (input, init) => {
      seenUrl = urlOf(input);
      seenMethod = init?.method ?? 'GET';
      return new Response('ok', { status: 200 });
    });

    const res = await hubFetch('/api/foo');
    expect(res.status).toBe(200);
    expect(seenUrl).toBe('http://127.0.0.1:3001/api/foo');
    expect(seenMethod).toBe('GET');
  });

  test('passes through init (method, body, headers)', async () => {
    let seenMethod = '';
    let seenBody = '';
    let seenAccept = '';
    bun.fetch(async (_input, init) => {
      seenMethod = init?.method ?? 'GET';
      seenBody = typeof init?.body === 'string' ? init.body : '';
      seenAccept = new Headers(init?.headers).get('accept') ?? '';
      return new Response('', { status: 204 });
    });

    await hubFetch('/api/bar', {
      method: 'POST',
      body: 'hello',
      headers: { accept: 'application/json' },
    });

    expect(seenMethod).toBe('POST');
    expect(seenBody).toBe('hello');
    expect(seenAccept).toBe('application/json');
  });
});

describe('hubFetchOk', () => {
  const bun = useBunMock();
  let home: string;
  let originalHome: string | undefined;
  let originalHost: string | undefined;
  let originalPort: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-hub-client-'));
    originalHome = process.env.BRIKA_HOME;
    originalHost = process.env.BRIKA_HOST;
    originalPort = process.env.BRIKA_PORT;
    process.env.BRIKA_HOME = home;
    delete process.env.BRIKA_HOST;
    delete process.env.BRIKA_PORT;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = originalHome;
    }
    if (originalHost === undefined) {
      delete process.env.BRIKA_HOST;
    } else {
      process.env.BRIKA_HOST = originalHost;
    }
    if (originalPort === undefined) {
      delete process.env.BRIKA_PORT;
    } else {
      process.env.BRIKA_PORT = originalPort;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test('returns the response on success', async () => {
    bun.fetch(async () => new Response('ok', { status: 200 }));
    const res = await hubFetchOk('/api/ok');
    expect(res.status).toBe(200);
  });

  test('throws CliError including the body on non-ok', async () => {
    bun.fetch(async () => new Response('something broke', { status: 500 }));
    let caught: unknown;
    try {
      await hubFetchOk('/api/fail');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    if (caught instanceof CliError) {
      expect(caught.message).toContain('something broke');
    }
  });

  test('falls back to a generic message when the body is empty', async () => {
    bun.fetch(async () => new Response('', { status: 503 }));
    let caught: unknown;
    try {
      await hubFetchOk('/api/fail');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    if (caught instanceof CliError) {
      expect(caught.message).toContain('hub returned 503');
    }
  });
});
