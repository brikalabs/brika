import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseStandaloneEnv } from './env';

const TMP_ROOT = `/tmp/brika-env-test-${process.pid}`;

let exitCalled: { code: number | undefined } | null = null;

function captureExit(): { stop: () => void } {
  const original = process.exit;
  const fakeExit = (code?: number): never => {
    exitCalled = { code };
    throw new Error(`__exit_${code ?? 0}__`);
  };
  // process.exit's signature is `(code?: number) => never` — cast through the
  // narrowed shape because the spy machinery doesn't preserve the never return.
  (process as unknown as { exit: (code?: number) => never }).exit = fakeExit;
  return {
    stop(): void {
      process.exit = original;
    },
  };
}

beforeEach(() => {
  exitCalled = null;
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

function baseEnv(
  extra: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    BRIKA_SIGNALING_SQLITE_PATH: join(TMP_ROOT, 'db.sqlite'),
    BRIKA_SIGNALING_ASSETS_DIR: TMP_ROOT,
    TICKET_SECRET: 'test-secret-please-rotate-32chars',
    ...extra,
  };
}

describe('parseStandaloneEnv — defaults', () => {
  it('fills in sqlitePath/turn/port/host/assets/max from defaults when unset', () => {
    const env = parseStandaloneEnv(baseEnv());
    expect(env.sqlitePath).toBe(join(TMP_ROOT, 'db.sqlite'));
    expect(env.turn).toEqual({ kind: 'static', servers: [] });
    expect(env.port).toBe(8787);
    expect(env.host).toBe('0.0.0.0');
    expect(env.assetsDir).toBe(TMP_ROOT);
    expect(env.maxHubs).toBe(1000);
    expect(env.allowedOrigins).toBeUndefined();
  });

  it('passes through TICKET_SECRET when ≥16 chars', () => {
    const env = parseStandaloneEnv(baseEnv());
    expect(env.ticketSecret).toBe('test-secret-please-rotate-32chars');
  });

  it('coerces PORT and MAX_HUBS from strings', () => {
    const env = parseStandaloneEnv(
      baseEnv({ BRIKA_SIGNALING_PORT: '9000', BRIKA_SIGNALING_MAX_HUBS: '42' })
    );
    expect(env.port).toBe(9000);
    expect(env.maxHubs).toBe(42);
  });

  it('parses ALLOWED_ORIGINS as CSV, trims + drops empties', () => {
    const env = parseStandaloneEnv(
      baseEnv({ ALLOWED_ORIGINS: 'https://a.example, ,https://b.example' })
    );
    expect(env.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('parseStandaloneEnv — TURN', () => {
  it('none returns { kind: none }', () => {
    const env = parseStandaloneEnv(baseEnv({ BRIKA_SIGNALING_TURN: 'none' }));
    expect(env.turn).toEqual({ kind: 'none' });
  });

  it('cloudflare requires APP_ID + APP_TOKEN', () => {
    const cap = captureExit();
    try {
      expect(() => parseStandaloneEnv(baseEnv({ BRIKA_SIGNALING_TURN: 'cloudflare' }))).toThrow();
      expect(exitCalled?.code).toBe(1);
    } finally {
      cap.stop();
    }
  });

  it('cloudflare TURN passes app id + token through', () => {
    const env = parseStandaloneEnv(
      baseEnv({
        BRIKA_SIGNALING_TURN: 'cloudflare',
        CF_REALTIME_APP_ID: 'app-id',
        CF_REALTIME_APP_TOKEN: 'app-token',
      })
    );
    expect(env.turn).toEqual({ kind: 'cloudflare', appId: 'app-id', token: 'app-token' });
  });

  it('static TURN parses the supplied JSON', () => {
    const env = parseStandaloneEnv(
      baseEnv({
        BRIKA_SIGNALING_TURN_STATIC: JSON.stringify([
          { urls: 'turn:turn.example:3478', username: 'u', credential: 'c' },
        ]),
      })
    );
    expect(env.turn).toEqual({
      kind: 'static',
      servers: [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'c' }],
    });
  });

  it('static TURN with non-array JSON exits', () => {
    const cap = captureExit();
    try {
      expect(() =>
        parseStandaloneEnv(baseEnv({ BRIKA_SIGNALING_TURN_STATIC: '{"not":"an array"}' }))
      ).toThrow();
      expect(exitCalled?.code).toBe(1);
    } finally {
      cap.stop();
    }
  });
});

describe('parseStandaloneEnv — TICKET_SECRET auto-gen', () => {
  it('generates + persists a dev secret when TICKET_SECRET is unset', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const env = parseStandaloneEnv({
        BRIKA_SIGNALING_SQLITE_PATH: join(TMP_ROOT, 'db.sqlite'),
        BRIKA_SIGNALING_ASSETS_DIR: TMP_ROOT,
      });
      expect(env.ticketSecret.length).toBeGreaterThanOrEqual(16);
      const secretPath = join(TMP_ROOT, '.signaling-secret');
      expect(existsSync(secretPath)).toBe(true);
      expect(readFileSync(secretPath, 'utf-8').trim()).toBe(env.ticketSecret);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reuses the persisted secret on subsequent reads', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const first = parseStandaloneEnv({
        BRIKA_SIGNALING_SQLITE_PATH: join(TMP_ROOT, 'db.sqlite'),
        BRIKA_SIGNALING_ASSETS_DIR: TMP_ROOT,
      });
      const second = parseStandaloneEnv({
        BRIKA_SIGNALING_SQLITE_PATH: join(TMP_ROOT, 'db.sqlite'),
        BRIKA_SIGNALING_ASSETS_DIR: TMP_ROOT,
      });
      expect(second.ticketSecret).toBe(first.ticketSecret);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('NODE_ENV=production without TICKET_SECRET exits(1)', () => {
    const cap = captureExit();
    try {
      expect(() =>
        parseStandaloneEnv({
          BRIKA_SIGNALING_SQLITE_PATH: join(TMP_ROOT, 'db.sqlite'),
          BRIKA_SIGNALING_ASSETS_DIR: TMP_ROOT,
          NODE_ENV: 'production',
        })
      ).toThrow();
      expect(exitCalled?.code).toBe(1);
    } finally {
      cap.stop();
    }
  });

  it('BRIKA_SIGNALING_PRODUCTION=1 enforces the same gate as NODE_ENV', () => {
    const cap = captureExit();
    try {
      expect(() =>
        parseStandaloneEnv({
          BRIKA_SIGNALING_SQLITE_PATH: join(TMP_ROOT, 'db.sqlite'),
          BRIKA_SIGNALING_ASSETS_DIR: TMP_ROOT,
          BRIKA_SIGNALING_PRODUCTION: '1',
        })
      ).toThrow();
      expect(exitCalled?.code).toBe(1);
    } finally {
      cap.stop();
    }
  });

  it('TICKET_SECRET <16 chars triggers Zod validation error → exits', () => {
    const cap = captureExit();
    try {
      expect(() => parseStandaloneEnv(baseEnv({ TICKET_SECRET: 'too-short' }))).toThrow();
      expect(exitCalled?.code).toBe(1);
    } finally {
      cap.stop();
    }
  });
});
