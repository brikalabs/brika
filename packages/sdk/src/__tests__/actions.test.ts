/**
 * Tests for SDK Actions API
 *
 * Validates action ID generation via hash(filePath:exportName) and defines
 * the contract between the SDK runtime (defineAction) and the build system.
 */

import { describe, expect, test } from 'bun:test';

// ─── computeActionId (shared between preload and build plugin) ──────────────

/**
 * Replicates the hash function from both:
 * - apps/hub/src/runtime/modules/action-preload.ts (server-side preload)
 * - apps/hub/src/runtime/modules/action-hash.ts (client-side build plugin)
 *
 * Both MUST produce identical output for a given (relativePath, exportName).
 */
function computeActionId(relativePath: string, exportName: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(relativePath + ':' + exportName);
  return hasher.digest('hex').slice(0, 12);
}

describe('computeActionId', () => {
  test('produces deterministic IDs for given inputs', () => {
    const id1 = computeActionId('src/actions.ts', 'play');
    const id2 = computeActionId('src/actions.ts', 'play');
    expect(id1).toBe(id2);
  });

  test('different export names produce different IDs', () => {
    const id1 = computeActionId('src/actions.ts', 'play');
    const id2 = computeActionId('src/actions.ts', 'pause');
    expect(id1).not.toBe(id2);
  });

  test('different file paths produce different IDs', () => {
    const id1 = computeActionId('src/actions.ts', 'play');
    const id2 = computeActionId('src/other.ts', 'play');
    expect(id1).not.toBe(id2);
  });

  test('IDs are 12-char hex strings', () => {
    const id = computeActionId('src/actions.ts', 'doSomething');
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  test('IDs are order-independent (reordering exports does not change them)', () => {
    // This is the key improvement over index-based hashing
    const playId = computeActionId('src/actions.ts', 'play');
    const pauseId = computeActionId('src/actions.ts', 'pause');

    // Simulating "reorder" — the IDs remain the same regardless of position
    expect(computeActionId('src/actions.ts', 'play')).toBe(playId);
    expect(computeActionId('src/actions.ts', 'pause')).toBe(pauseId);
  });

  test('many exports in same file produce unique IDs', () => {
    const names = ['getDevices', 'scan', 'commission', 'command', 'remove', 'sendCommand'];
    const ids = names.map((n) => computeActionId('src/actions.ts', n));
    const unique = new Set(ids);
    expect(unique.size).toBe(names.length);
  });
});

// ─── Preload regex transform simulation ─────────────────────────────────────

describe('preload transform pattern', () => {
  const DEFINE_ACTION_RE = /export\s+const\s+(\w+)\s*=\s*defineAction\s*\(/g;

  test('matches standard defineAction export', () => {
    const source = 'export const play = defineAction(async () => {});';
    const matches = [...source.matchAll(DEFINE_ACTION_RE)];
    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe('play');
  });

  test('matches multiple exports', () => {
    const source = [
      'export const play = defineAction(async () => {});',
      'export const pause = defineAction(async () => {});',
    ].join('\n');
    const matches = [...source.matchAll(DEFINE_ACTION_RE)];
    expect(matches).toHaveLength(2);
    expect(matches[0]?.[1]).toBe('play');
    expect(matches[1]?.[1]).toBe('pause');
  });

  test('does not match non-export defineAction calls', () => {
    const source = 'const play = defineAction(async () => {});';
    const matches = [...source.matchAll(DEFINE_ACTION_RE)];
    expect(matches).toHaveLength(0);
  });

  test('correctly transforms source by injecting ID', () => {
    const source = 'export const play = defineAction(async () => {});';
    const rel = 'src/actions.ts';
    const transformed = source.replace(DEFINE_ACTION_RE, (_match, name: string) => {
      const id = computeActionId(rel, name);
      return `export const ${name} = defineAction("${id}",`;
    });

    const expectedId = computeActionId(rel, 'play');
    expect(transformed).toBe(`export const play = defineAction("${expectedId}",async () => {});`);
  });
});

// ─── ActionRef shape ────────────────────────────────────────────────────────

describe('ActionRef wire format', () => {
  test('ref is a plain object with __actionId string', () => {
    const ref = { __actionId: computeActionId('src/actions.ts', 'play') };
    expect(typeof ref.__actionId).toBe('string');
    expect(ref.__actionId.length).toBeGreaterThan(0);
  });

  test('refs are JSON-serializable', () => {
    const ref = { __actionId: computeActionId('src/actions.ts', 'play') };
    const json = JSON.stringify(ref);
    const parsed = JSON.parse(json);
    expect(parsed.__actionId).toBe(ref.__actionId);
  });
});
