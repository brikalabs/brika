/**
 * Tests for CLI command registry, auto-discovery, and individual command handlers.
 *
 * NOTE: This file avoids mock.module() to prevent Bun's mock bleed (Bun #12823).
 * Handler tests use globalThis.fetch interception instead.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { CliError } from '@/cli/errors';
import { cli } from '@/cli/commands';
import { captureLog } from './helpers/capture';

/* ------------------------------------------------------------------ */
/*  Command registry & auto-discovery                                  */
/* ------------------------------------------------------------------ */

const { commands } = cli;

describe('cli/commands', () => {
  const expectedCommands = [
    'start',
    'stop',
    'status',
    'open',
    'plugin',
    'version',
    'update',
    'uninstall',
    'help',
  ];

  describe('auto-discovery', () => {
    test('discovers all built-in commands', () => {
      const names = commands.map((c) => c.name);
      for (const name of expectedCommands) {
        expect(names).toContain(name);
      }
    });

    test('every command has a name and description', () => {
      for (const cmd of commands) {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
      }
    });

    test('every command has a handler function', () => {
      for (const cmd of commands) {
        expect(typeof cmd.handler).toBe('function');
      }
    });

    test('help command is always last', () => {
      const last = commands[commands.length - 1];
      expect(last.name).toBe('help');
    });
  });

  describe('commandMap', () => {
    test('resolves commands by name', () => {
      for (const name of expectedCommands) {
        expect(cli.get(name)?.name).toBe(name);
      }
    });

    test('resolves version command via -v alias', () => {
      expect(cli.get('-v')?.name).toBe('version');
    });

    test('resolves version command via --version alias', () => {
      expect(cli.get('--version')?.name).toBe('version');
    });

    test('resolves help command via -h alias', () => {
      expect(cli.get('-h')?.name).toBe('help');
    });

    test('resolves help command via --help alias', () => {
      expect(cli.get('--help')?.name).toBe('help');
    });

    test('returns undefined for unknown command', () => {
      expect(cli.get('nonexistent')).toBeUndefined();
    });
  });

  describe('collision detection', () => {
    test('no duplicate names or aliases exist in the registry', () => {
      const seen = new Map<string, string>();
      for (const cmd of commands) {
        const keys = [cmd.name, ...(cmd.aliases ?? [])];
        for (const key of keys) {
          const existing = seen.get(key);
          if (existing) {
            throw new Error(`Collision: "${key}" claimed by both "${existing}" and "${cmd.name}"`);
          }
          seen.set(key, cmd.name);
        }
      }
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function captureError(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => lines.push(args.join(' '));
  return { lines, restore: () => (console.error = original) };
}

/** Build a mock Response whose .json() returns the given body. */
function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a mock SSE Response with the given events. */
function sseResponse(events: unknown[]): Response {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n`).join('\n');
  return new Response(lines, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/* ------------------------------------------------------------------ */
/*  plugin install                                                     */
/* ------------------------------------------------------------------ */

describe('cli/commands/plugin/install', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;
  let installCmd: typeof import('@/cli/commands/plugin/install').default;

  beforeEach(async () => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    installCmd = (await import('@/cli/commands/plugin/install')).default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('parsePackageSpec (via handler)', () => {
    test('scoped package with version sends correct name and version', async () => {
      let sentBody: string | undefined;
      mockFetch.mockImplementation(async (_url: unknown, init: RequestInit | undefined) => {
        sentBody = init?.body as string;
        return sseResponse([{ phase: 'complete' }]);
      });

      const log = captureLog();
      await installCmd.handler({
        positionals: ['@brika/plugin-timer@1.0.0'],
        values: {},
        commands: [],
      });
      log.restore();

      const parsed = JSON.parse(sentBody ?? '{}');
      expect(parsed.package).toBe('@brika/plugin-timer');
      expect(parsed.version).toBe('1.0.0');
    });

    test('scoped package without version sends name only', async () => {
      let sentBody: string | undefined;
      mockFetch.mockImplementation(async (_url: unknown, init: RequestInit | undefined) => {
        sentBody = init?.body as string;
        return sseResponse([{ phase: 'complete' }]);
      });

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/plugin-timer'], values: {}, commands: [] });
      log.restore();

      const parsed = JSON.parse(sentBody ?? '{}');
      expect(parsed.package).toBe('@brika/plugin-timer');
      expect(parsed.version).toBeUndefined();
    });

    test('simple package with version sends correct name and version', async () => {
      let sentBody: string | undefined;
      mockFetch.mockImplementation(async (_url: unknown, init: RequestInit | undefined) => {
        sentBody = init?.body as string;
        return sseResponse([{ phase: 'complete' }]);
      });

      const log = captureLog();
      await installCmd.handler({ positionals: ['my-plugin@2.3.4'], values: {}, commands: [] });
      log.restore();

      const parsed = JSON.parse(sentBody ?? '{}');
      expect(parsed.package).toBe('my-plugin');
      expect(parsed.version).toBe('2.3.4');
    });
  });

  describe('handler', () => {
    test('throws CliError when no package name is provided', async () => {
      await expect(
        installCmd.handler({ positionals: [], values: {}, commands: [] })
      ).rejects.toThrow(CliError);
    });

    test('throws CliError with usage hint when no package name is provided', async () => {
      try {
        await installCmd.handler({ positionals: [], values: {}, commands: [] });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        expect((e as CliError).message).toContain('Missing package name');
      }
    });

    test('POSTs to /api/registry/install', async () => {
      let calledUrl: string | undefined;
      let calledMethod: string | undefined;
      mockFetch.mockImplementation(async (url: unknown, init: RequestInit | undefined) => {
        calledUrl = String(url);
        calledMethod = init?.method;
        return sseResponse([{ phase: 'complete' }]);
      });

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(calledUrl).toContain('/api/registry/install');
      expect(calledMethod).toBe('POST');
    });

    test('logs installing message with package name', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'complete' }]));

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(log.lines.some((l) => l.includes('@brika/test'))).toBe(true);
    });
  });

  describe('printProgress (via SSE stream)', () => {
    test('resolving phase logs resolving message', async () => {
      mockFetch.mockResolvedValue(
        sseResponse([{ phase: 'resolving', package: '@brika/test' }, { phase: 'complete' }])
      );

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(log.lines.some((l) => l.includes('Resolving'))).toBe(true);
    });

    test('downloading phase logs downloading message', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'downloading' }, { phase: 'complete' }]));

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(log.lines.some((l) => l.includes('Downloading'))).toBe(true);
    });

    test('linking phase logs linking message', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'linking' }, { phase: 'complete' }]));

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(log.lines.some((l) => l.includes('Linking'))).toBe(true);
    });

    test('complete phase logs success message', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'complete', message: 'Done!' }]));

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(log.lines.some((l) => l.includes('Done!'))).toBe(true);
    });

    test('complete phase uses default message when none provided', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'complete' }]));

      const log = captureLog();
      await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
      log.restore();

      expect(log.lines.some((l) => l.includes('Installed successfully'))).toBe(true);
    });

    test('error phase throws CliError', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'error', error: 'Something broke' }]));

      const log = captureLog();
      try {
        await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        expect((e as CliError).message).toContain('Something broke');
      } finally {
        log.restore();
      }
    });

    test('error phase uses fallback message when neither error nor message provided', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ phase: 'error' }]));

      const log = captureLog();
      try {
        await installCmd.handler({ positionals: ['@brika/test'], values: {}, commands: [] });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        expect((e as CliError).message).toContain('Installation failed');
      } finally {
        log.restore();
      }
    });
  });
});

/* ------------------------------------------------------------------ */
/*  plugin uninstall                                                   */
/* ------------------------------------------------------------------ */

describe('cli/commands/plugin/uninstall', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;
  let uninstallCmd: typeof import('@/cli/commands/plugin/uninstall').default;

  beforeEach(async () => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    uninstallCmd = (await import('@/cli/commands/plugin/uninstall')).default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('command metadata is correct', () => {
    expect(uninstallCmd.name).toBe('uninstall');
    expect(uninstallCmd.aliases).toContain('remove');
    expect(uninstallCmd.description).toBeTruthy();
  });

  test('throws CliError when no package name is provided', async () => {
    await expect(
      uninstallCmd.handler({ positionals: [], values: {}, commands: [] })
    ).rejects.toThrow(CliError);
  });

  test('uses plugin UID endpoint when plugin is loaded', async () => {
    let deletePath: string | undefined;
    let callCount = 0;
    mockFetch.mockImplementation(async (url: unknown) => {
      callCount++;
      const urlStr = String(url);
      if (urlStr.includes('/api/plugins') && !urlStr.includes('/api/plugins/')) {
        // First call: resolve UID
        return jsonResponse([{ uid: 'abc-123', name: '@brika/plugin-timer' }]);
      }
      // Second call: delete
      deletePath = urlStr;
      return jsonResponse({ success: true });
    });

    const log = captureLog();
    await uninstallCmd.handler({
      positionals: ['@brika/plugin-timer'],
      values: {},
      commands: [],
    });
    log.restore();

    expect(deletePath).toContain('/api/plugins/abc-123');
  });

  test('falls back to registry endpoint when plugin is not loaded', async () => {
    let deletePath: string | undefined;
    mockFetch.mockImplementation(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/plugins') && !urlStr.includes('/api/plugins/')) {
        return jsonResponse([{ uid: 'other-uid', name: '@brika/other-plugin' }]);
      }
      deletePath = urlStr;
      return jsonResponse({ success: true });
    });

    const log = captureLog();
    await uninstallCmd.handler({
      positionals: ['@brika/plugin-timer'],
      values: {},
      commands: [],
    });
    log.restore();

    expect(deletePath).toContain('/api/registry/packages/');
  });

  test('falls back to registry endpoint when plugin list fetch fails', async () => {
    let deletePath: string | undefined;
    mockFetch.mockImplementation(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/plugins') && !urlStr.includes('/api/plugins/')) {
        return new Response('', { status: 500 });
      }
      deletePath = urlStr;
      return jsonResponse({ success: true });
    });

    const log = captureLog();
    await uninstallCmd.handler({
      positionals: ['@brika/plugin-timer'],
      values: {},
      commands: [],
    });
    log.restore();

    expect(deletePath).toContain('/api/registry/packages/');
  });

  test('logs success message after uninstall', async () => {
    mockFetch.mockImplementation(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/plugins') && !urlStr.includes('/api/plugins/')) {
        return jsonResponse([]);
      }
      return jsonResponse({ success: true });
    });

    const log = captureLog();
    await uninstallCmd.handler({
      positionals: ['@brika/plugin-timer'],
      values: {},
      commands: [],
    });
    log.restore();

    expect(log.lines.some((l) => l.includes('uninstalled'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  plugin list                                                        */
/* ------------------------------------------------------------------ */

describe('cli/commands/plugin/list', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;
  let listCmd: typeof import('@/cli/commands/plugin/list').default;

  beforeEach(async () => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    listCmd = (await import('@/cli/commands/plugin/list')).default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('command metadata is correct', () => {
    expect(listCmd.name).toBe('list');
    expect(listCmd.aliases).toContain('ls');
    expect(listCmd.description).toBeTruthy();
  });

  test('shows empty message when no plugins are installed', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ packages: [] }));

    const log = captureLog();
    await listCmd.handler({ positionals: [], values: {}, commands: [] });
    log.restore();

    expect(log.lines.some((l) => l.includes('No plugins installed'))).toBe(true);
  });

  test('lists installed plugins with name and version', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        packages: [
          { name: '@brika/plugin-timer', version: '1.0.0', path: '/some/path' },
          { name: '@brika/plugin-weather', version: '2.1.0', path: '/other/path' },
        ],
      })
    );

    const log = captureLog();
    await listCmd.handler({ positionals: [], values: {}, commands: [] });
    log.restore();

    const output = log.lines.join('\n');
    expect(output).toContain('@brika/plugin-timer');
    expect(output).toContain('1.0.0');
    expect(output).toContain('@brika/plugin-weather');
    expect(output).toContain('2.1.0');
  });

  test('shows header when plugins exist', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        packages: [{ name: '@brika/plugin-timer', version: '1.0.0', path: '/path' }],
      })
    );

    const log = captureLog();
    await listCmd.handler({ positionals: [], values: {}, commands: [] });
    log.restore();

    expect(log.lines.some((l) => l.includes('Installed plugins'))).toBe(true);
  });
});
