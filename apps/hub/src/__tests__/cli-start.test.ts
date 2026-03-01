/**
 * Tests for the start CLI command
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { cli } from '@/cli/commands';

describe('cli/commands/start', () => {
  const bun = useBunMock();
  const start = cli.get('start');

  afterEach(() => {
    delete process.env.BRIKA_STATIC_DIR;
  });

  test('is registered', () => {
    expect(start).toBeDefined();
    expect(start?.name).toBe('start');
  });

  test('has --foreground option with -f short alias', () => {
    expect(start?.options?.foreground).toMatchObject({
      type: 'boolean',
      short: 'f',
    });
  });

  test('has --port and --host options', () => {
    expect(start?.options?.port).toMatchObject({
      type: 'string',
      short: 'p',
    });
    expect(start?.options?.host).toMatchObject({
      type: 'string',
    });
  });

  test('has --open option with -o short alias', () => {
    expect(start?.options?.open).toMatchObject({
      type: 'boolean',
      short: 'o',
    });
  });

  test('has examples', () => {
    expect(start?.examples?.length).toBeGreaterThan(0);
  });

  describe('auto-detach', () => {
    test('spawns background child when foreground is not set', async () => {
      // Mock process.exit and Bun.spawn to capture the detach behavior
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
        throw new Error('__EXIT__');
      }) as never;

      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      try {
        await start?.handler({
          values: {},
          positionals: [],
          commands: [],
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(0);
      expect(bun.spawnCalls.length).toBe(1);
      // Should pass --foreground to the child
      expect(bun.spawnCalls[0]?.cmd).toContain('--foreground');
      expect(bun.spawnCalls[0]?.cmd).toContain('start');
    });

    test('sets port env var when --port is given', async () => {
      const originalExit = process.exit;
      const originalPort = process.env.BRIKA_PORT;
      let capturedPort: string | undefined;

      process.exit = (() => {
        capturedPort = process.env.BRIKA_PORT;
        throw new Error('__EXIT__');
      }) as never;

      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      try {
        await start?.handler({
          values: {
            port: '9090',
          },
          positionals: [],
          commands: [],
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      } finally {
        process.exit = originalExit;
        if (originalPort === undefined) {
          delete process.env.BRIKA_PORT;
        } else {
          process.env.BRIKA_PORT = originalPort;
        }
      }

      expect(capturedPort).toBe('9090');
    });

    test('sets host env var when --host is given', async () => {
      const originalExit = process.exit;
      const originalHost = process.env.BRIKA_HOST;
      let capturedHost: string | undefined;

      process.exit = (() => {
        capturedHost = process.env.BRIKA_HOST;
        throw new Error('__EXIT__');
      }) as never;

      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      try {
        await start?.handler({
          values: {
            host: '0.0.0.0',
          },
          positionals: [],
          commands: [],
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      } finally {
        process.exit = originalExit;
        if (originalHost === undefined) {
          delete process.env.BRIKA_HOST;
        } else {
          process.env.BRIKA_HOST = originalHost;
        }
      }

      expect(capturedHost).toBe('0.0.0.0');
    });

    test('opens browser when --open is set in detach mode', async () => {
      const originalExit = process.exit;
      process.exit = (() => {
        throw new Error('__EXIT__');
      }) as never;

      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      try {
        await start?.handler({
          values: {
            open: true,
          },
          positionals: [],
          commands: [],
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      } finally {
        process.exit = originalExit;
      }

      // First spawn is the detached hub, second is the browser open
      expect(bun.spawnCalls.length).toBe(2);
      const openCall = bun.spawnCalls[1];
      expect(openCall?.cmd).toContain('http://127.0.0.1:3001');
    });
  });
});
