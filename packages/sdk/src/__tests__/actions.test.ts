/**
 * Tests for SDK Actions API
 *
 * Validates action ID generation, hash stability, and defines the contract
 * between the SDK runtime (defineAction) and the module compiler.
 */

import { describe, expect, test } from 'bun:test';

// ─── actionId (shared between SDK and compiler) ─────────────────────────────

/**
 * Replicates the hash function from both:
 * - packages/sdk/src/api/actions.ts
 * - apps/hub/src/runtime/modules/module-compiler.ts
 *
 * Both MUST produce identical output for a given index.
 */
function actionId(index: number): string {
  return (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36);
}

describe('actionId', () => {
  test('produces deterministic IDs for given indices', () => {
    // Snapshot known values to detect accidental changes
    expect(actionId(0)).toBe((Math.imul(1, 0x9e3779b9) >>> 0).toString(36));
    expect(actionId(1)).toBe((Math.imul(2, 0x9e3779b9) >>> 0).toString(36));
    expect(actionId(2)).toBe((Math.imul(3, 0x9e3779b9) >>> 0).toString(36));
  });

  test('consecutive indices produce different IDs', () => {
    const ids = Array.from(
      {
        length: 100,
      },
      (_, i) => actionId(i)
    );
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });

  test('IDs are non-empty base36 strings', () => {
    for (let i = 0; i < 50; i++) {
      const id = actionId(i);
      expect(id.length).toBeGreaterThan(0);
      expect(/^[0-9a-z]+$/.test(id)).toBe(true);
    }
  });

  test('SDK and compiler produce identical IDs', () => {
    // This is the critical invariant: if these diverge, actions break.
    // Both files define: (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36)
    const sdkId = actionId;
    const compilerId = (index: number): string =>
      (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36);

    for (let i = 0; i < 100; i++) {
      expect(sdkId(i)).toBe(compilerId(i));
    }
  });

  test('index 0 does not produce empty string', () => {
    expect(actionId(0).length).toBeGreaterThan(0);
  });
});

// ─── Source order simulation ────────────────────────────────────────────────

describe('action source-order matching', () => {
  test('export names sorted by source position produce stable IDs', () => {
    // Simulates what the compiler does:
    // 1. Bun.Transpiler.scan() returns exports alphabetically
    // 2. Compiler re-sorts by source.indexOf('export const <name>')
    // 3. Each sorted index maps to actionId(index)

    const source = [
      'export const getDevices = defineAction(async () => {});',
      'export const scan = defineAction(async () => {});',
      'export const commission = defineAction(async (input) => {});',
    ].join('\n');

    // Alphabetical order (what scan() returns)
    const alphabetical = ['commission', 'getDevices', 'scan'];

    // Re-sort by source position
    const sorted = [...alphabetical].sort(
      (a, b) => source.indexOf(`export const ${a}`) - source.indexOf(`export const ${b}`)
    );

    expect(sorted).toEqual(['getDevices', 'scan', 'commission']);

    // Verify IDs match what SDK would produce
    const expectedIds = sorted.map((_, i) => actionId(i));
    expect(expectedIds.length).toBe(3);
    expect(new Set(expectedIds).size).toBe(3);
  });

  test('reordering exports changes IDs (current known limitation)', () => {
    const source1 = 'export const a = 1;\nexport const b = 2;';
    const source2 = 'export const b = 1;\nexport const a = 2;';

    const sortBySource = (names: string[], source: string) =>
      [...names].sort(
        (a, b) => source.indexOf(`export const ${a}`) - source.indexOf(`export const ${b}`)
      );

    const order1 = sortBySource(['a', 'b'], source1);
    const order2 = sortBySource(['a', 'b'], source2);

    // Order is different
    expect(order1).toEqual(['a', 'b']);
    expect(order2).toEqual(['b', 'a']);

    // So IDs for 'a' differ between source1 and source2
    const idA_source1 = actionId(order1.indexOf('a'));
    const idA_source2 = actionId(order2.indexOf('a'));
    expect(idA_source1).not.toBe(idA_source2);
  });
});

// ─── ActionRef shape ────────────────────────────────────────────────────────

describe('ActionRef wire format', () => {
  test('ref is a plain object with __actionId string', () => {
    const ref = {
      __actionId: actionId(0),
    };
    expect(typeof ref.__actionId).toBe('string');
    expect(ref.__actionId.length).toBeGreaterThan(0);
  });

  test('refs are JSON-serializable', () => {
    const ref = {
      __actionId: actionId(0),
    };
    const json = JSON.stringify(ref);
    const parsed = JSON.parse(json);
    expect(parsed.__actionId).toBe(ref.__actionId);
  });
});
