/**
 * Integration test for the capability flow:
 *   ctx.ui.pickFile  →  hub mints /user/<token>/<name>
 *                    →  plugin reads it via ctx.fs.readFile
 *
 * Uses a real temp file + a stub picker that hands back the host path.
 * Verifies that:
 *   - the picker result yields a usable virtual path
 *   - read is gated on the plugin having `/user/**` in scope
 *   - a /user path without minting is rejected
 *   - cancelled picks return `{cancelled: true}` and don't mint
 *   - file name tampering on the virtual path is rejected
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrikaError } from '@brika/errors';
import type { UiPickFileResult } from '@brika/sdk/grants';
import { EphemeralRoots } from '../fs';
import { buildHubGrants } from '../registry-factory';

function isPicked(result: unknown): result is { cancelled: false; path: string; fileName: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    Reflect.get(result, 'cancelled') === false &&
    typeof Reflect.get(result, 'path') === 'string'
  );
}

async function pick(
  reg: ReturnType<typeof buildHubGrants>,
  scope: unknown
): Promise<UiPickFileResult> {
  const raw = await reg.dispatch('dev.brika.ui.pickFile', {}, handlerCtx(scope));
  if (
    typeof raw === 'object' &&
    raw !== null &&
    typeof Reflect.get(raw, 'cancelled') === 'boolean'
  ) {
    if (isPicked(raw)) {
      return raw;
    }
    return { cancelled: true };
  }
  throw new Error('unexpected pick result shape');
}

const NET_NOOP = { fetch: () => Promise.resolve(new Response('')) };

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'ui-test',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

let workDir: string;
let pickedPath: string | null;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'brika-ui-test-'));
  pickedPath = null;
});

afterEach(() => {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function buildRegistry() {
  const dirs = {
    bundle: join(workDir, 'bundle'),
    data: join(workDir, 'data'),
    cache: join(workDir, 'cache'),
    tmp: join(workDir, 'tmp'),
  };
  for (const d of Object.values(dirs)) {
    mkdirSync(d, { recursive: true });
  }
  const ephemeral = new EphemeralRoots();
  return buildHubGrants(NET_NOOP, {
    fs: { dirs, ephemeral },
    ui: {
      ephemeral,
      picker: async () => pickedPath,
    },
  });
}

describe('ctx.ui.pickFile + ctx.fs.readFile capability flow', () => {
  test('picked file is readable via the minted /user/<token> path', async () => {
    const filePath = join(workDir, 'picked.txt');
    writeFileSync(filePath, 'user-content');
    pickedPath = filePath;

    const reg = buildRegistry();
    const picked = await pick(reg, { acceptFilters: [] });
    if (!isPicked(picked)) {
      throw new Error('expected non-cancelled pick');
    }
    expect(picked.fileName).toBe('picked.txt');
    expect(picked.path).toMatch(/^\/user\/[0-9a-f]+\/picked\.txt$/);

    const out = await reg.dispatch(
      'dev.brika.fs.readFile',
      { path: picked.path, encoding: 'utf-8' },
      handlerCtx({ read: ['/user/**'], write: [] })
    );
    expect(out).toEqual({ encoding: 'utf-8', content: 'user-content' });
  });

  test('reading a /user path without /user/** in scope is denied', async () => {
    const filePath = join(workDir, 'secret.txt');
    writeFileSync(filePath, 'shh');
    pickedPath = filePath;
    const reg = buildRegistry();
    const picked = await pick(reg, { acceptFilters: [] });
    if (!isPicked(picked)) {
      throw new Error('expected non-cancelled pick');
    }

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.readFile',
        { path: picked.path, encoding: 'utf-8' },
        // Note: no /user/** in scope.
        handlerCtx({ read: ['/data/**'], write: [] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('forged /user/<random>/x.txt with no mint is rejected', async () => {
    const reg = buildRegistry();
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.readFile',
        { path: '/user/deadbeef/anything.txt' },
        handlerCtx({ read: ['/user/**'], write: [] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_PATH_OUTSIDE_ROOT');
  });

  test('cancelled pick yields {cancelled: true} and mints nothing', async () => {
    pickedPath = null;
    const reg = buildRegistry();
    const result = await reg.dispatch(
      'dev.brika.ui.pickFile',
      {},
      handlerCtx({ acceptFilters: [] })
    );
    expect(result).toEqual({ cancelled: true });
  });

  test('write to a /user path is always denied (capability is read-only)', async () => {
    const filePath = join(workDir, 'readonly.txt');
    writeFileSync(filePath, 'original');
    pickedPath = filePath;

    const reg = buildRegistry();
    const picked = await pick(reg, { acceptFilters: [] });
    if (!isPicked(picked)) {
      throw new Error('expected non-cancelled pick');
    }

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.writeFile',
        { path: picked.path, content: 'tampered' },
        // Even with /user/** in WRITE scope, ephemeral paths are read-only.
        handlerCtx({ read: ['/user/**'], write: ['/user/**'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('virtual-path filename tampering is rejected (token alone insufficient)', async () => {
    const filePath = join(workDir, 'real.txt');
    writeFileSync(filePath, 'real content');
    pickedPath = filePath;

    const reg = buildRegistry();
    const picked = await pick(reg, { acceptFilters: [] });
    if (!isPicked(picked)) {
      throw new Error('expected non-cancelled pick');
    }
    // Swap the filename — same token, different name. The resolver
    // returns null and the path is rejected.
    const tampered = picked.path.replace(/real\.txt$/, 'evil.txt');

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.readFile',
        { path: tampered },
        handlerCtx({ read: ['/user/**'], write: [] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_PATH_OUTSIDE_ROOT');
  });
});
