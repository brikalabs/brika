/**
 * Tests for PackageManager
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { BunRunner } from '@/runtime/config';
import { PackageManager } from '@/runtime/registry/package-manager';
import type { OperationProgress } from '@/runtime/registry/types';

describe('PackageManager', () => {
  const bun = useBunMock();
  const pluginsDir = '/test/plugins';

  let pm: PackageManager;

  beforeEach(() => {
    pm = new PackageManager(new BunRunner(), pluginsDir);
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function collect(gen: AsyncGenerator<OperationProgress>): Promise<OperationProgress[]> {
    const items: OperationProgress[] = [];
    for await (const item of gen) {
      items.push(item);
    }
    return items;
  }

  function spawnOptions(index = 0): Record<string, unknown> {
    return (bun.spawnCalls[index]?.options ?? {}) as Record<string, unknown>;
  }

  // ─── install ───────────────────────────────────────────────────────────────

  describe('install(name, version?)', () => {
    test('spawns: bun install <name>@<version>', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await collect(pm.install('@brika/plugin', '1.2.0'));

      expect(bun.spawnCalls[0]?.cmd).toEqual([process.execPath, 'install', '@brika/plugin@1.2.0']);
    });

    test('spawns: bun install <name> when no version given', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await collect(pm.install('@brika/plugin'));

      expect(bun.spawnCalls[0]?.cmd).toEqual([process.execPath, 'install', '@brika/plugin']);
    });

    test('uses pluginsDir as cwd', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await collect(pm.install('@brika/plugin'));

      expect(spawnOptions().cwd).toBe(pluginsDir);
    });

    test('sets BUN_INSTALL_CACHE_DIR', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await collect(pm.install('@brika/plugin'));

      const env = spawnOptions().env as Record<string, string>;
      expect(env?.BUN_INSTALL_CACHE_DIR).toBe('/test/plugins/.cache');
    });

    test('streams events with correct operation and package metadata', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Resolving...',
        })
        .apply();

      const events = await collect(pm.install('@brika/plugin', '1.0.0'));
      const streamed = events.filter((e) => e.message === 'Resolving...');

      expect(streamed[0]?.operation).toBe('install');
      expect(streamed[0]?.package).toBe('@brika/plugin');
    });

    test('throws on non-zero exit', async () => {
      bun
        .spawn({
          exitCode: 2,
        })
        .apply();

      await expect(collect(pm.install('@brika/plugin'))).rejects.toThrow('exit code 2');
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove(name)', () => {
    test('spawns: bun remove <name>', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await pm.remove('@brika/plugin');

      expect(bun.spawnCalls[0]?.cmd).toEqual([process.execPath, 'remove', '@brika/plugin']);
    });

    test('uses pluginsDir as cwd', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await pm.remove('@brika/plugin');

      expect(spawnOptions().cwd).toBe(pluginsDir);
    });

    test('throws on non-zero exit', async () => {
      bun
        .spawn({
          exitCode: 1,
        })
        .apply();

      await expect(pm.remove('@brika/plugin')).rejects.toThrow('exit code 1');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update(name?)', () => {
    test('spawns: bun update (all) when no name given', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await collect(pm.update());

      expect(bun.spawnCalls[0]?.cmd).toEqual([process.execPath, 'update']);
    });

    test('spawns: bun update <name> for specific package', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await collect(pm.update('@brika/plugin'));

      expect(bun.spawnCalls[0]?.cmd).toEqual([process.execPath, 'update', '@brika/plugin']);
    });

    test('streams events with correct operation', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Resolving...',
        })
        .apply();

      const events = await collect(pm.update('@brika/plugin'));
      const streamed = events.filter((e) => e.message === 'Resolving...');

      expect(streamed[0]?.operation).toBe('update');
    });

    test('uses "all" as package name when no name given', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Resolving...',
        })
        .apply();

      const events = await collect(pm.update());
      const streamed = events.filter((e) => e.message === 'Resolving...');

      expect(streamed[0]?.package).toBe('all');
    });

    test('throws on non-zero exit', async () => {
      bun
        .spawn({
          exitCode: 1,
        })
        .apply();

      await expect(collect(pm.update())).rejects.toThrow('exit code 1');
    });
  });

  // ─── phase detection ───────────────────────────────────────────────────────

  describe('phase detection', () => {
    const cases: Array<[input: string, phase: OperationProgress['phase']]> = [
      ['Resolving packages...', 'resolving'],
      ['resolving dependencies', 'resolving'],
      ['GET https://registry.npmjs.org/foo', 'downloading'],
      ['downloading 1.2.3', 'downloading'],
      ['fetch https://cdn.example.com', 'downloading'],
      ['Saved lockfile', 'linking'],
      ['installed @brika/plugin', 'linking'],
      ['linking node_modules', 'linking'],
      ['some other output', 'downloading'], // default falls back to downloading
    ];

    for (const [input, expected] of cases) {
      test(`"${input}" → ${expected}`, async () => {
        bun
          .spawn({
            exitCode: 0,
            stderr: input,
          })
          .apply();

        const events = await collect(pm.install('@brika/plugin'));
        const streamed = events.find((e) => e.message === input);

        expect(streamed?.phase).toBe(expected);
      });
    }
  });

  // ─── multi-line output ─────────────────────────────────────────────────────

  describe('multi-line stderr output', () => {
    test('yields one event per non-empty line', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Resolving...\nGET registry\nSaved lockfile',
        })
        .apply();

      const events = await collect(pm.install('@brika/plugin'));
      const messages = events.map((e) => e.message);

      expect(messages).toContain('Resolving...');
      expect(messages).toContain('GET registry');
      expect(messages).toContain('Saved lockfile');
    });

    test('does not yield events for empty lines', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Resolving...\n\nSaved lockfile',
        })
        .apply();

      const events = await collect(pm.install('@brika/plugin'));
      const messages = events.map((e) => e.message);

      expect(messages.filter((m) => !m?.trim())).toHaveLength(0);
    });
  });
});
