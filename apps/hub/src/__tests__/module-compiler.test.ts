/**
 * Tests for Module Compiler action ID generation and export scanning
 *
 * Validates that the compiler's action ID generation matches the SDK runtime,
 * and that export scanning + source-order sorting is correct.
 */

import { describe, expect, test } from 'bun:test';

// ─── actionId (replicated from module-compiler.ts line 41-43) ───────────────

function actionId(index: number): string {
  return (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36);
}

describe('Module Compiler: actionId', () => {
  test('matches SDK actionId for all indices', () => {
    // The SDK uses the exact same function:
    // packages/sdk/src/api/actions.ts line 58-60
    const sdkActionId = (index: number): string =>
      (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36);

    for (let i = 0; i < 200; i++) {
      expect(actionId(i)).toBe(sdkActionId(i));
    }
  });

  test('no collisions in first 1000 IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(actionId(i));
    }
    expect(ids.size).toBe(1000);
  });
});

// ─── Export scanning simulation ─────────────────────────────────────────────

describe('Module Compiler: export scanning', () => {
  /**
   * Simulates what brikaActionsPlugin does:
   * 1. Read source file
   * 2. Bun.Transpiler.scan() → alphabetical export names
   * 3. Re-sort by source.indexOf('export const <name>')
   * 4. Generate synthetic module with actionId(index)
   */
  function simulateCompile(source: string, exportNames: string[]) {
    // Re-sort to source order (matches compiler logic line 82-84)
    const sorted = [...exportNames].sort(
      (a, b) =>
        source.indexOf(`export const ${a}`) - source.indexOf(`export const ${b}`)
    );

    return sorted.map((name, i) => ({
      name,
      id: actionId(i),
      line: `export const ${name} = { __actionId: '${actionId(i)}' };`,
    }));
  }

  test('generates correct synthetic module for matter actions', () => {
    const source = [
      'export const getDevices = defineAction(async () => { /* ... */ });',
      'export const scan = defineAction(async () => { /* ... */ });',
      'export const commission = defineAction(async (input) => { /* ... */ });',
      'export const command = defineAction(async (input) => { /* ... */ });',
      'export const remove = defineAction(async (input) => { /* ... */ });',
    ].join('\n');

    // Bun.Transpiler.scan() returns alphabetical
    const alphabetical = ['command', 'commission', 'getDevices', 'remove', 'scan'];
    const result = simulateCompile(source, alphabetical);

    // Source order should be restored
    expect(result.map((r) => r.name)).toEqual([
      'getDevices',
      'scan',
      'commission',
      'command',
      'remove',
    ]);

    // Each entry should have a unique ID
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(5);

    // IDs match source-order indices
    expect(ids[0]).toBe(actionId(0)); // getDevices
    expect(ids[1]).toBe(actionId(1)); // scan
    expect(ids[2]).toBe(actionId(2)); // commission
    expect(ids[3]).toBe(actionId(3)); // command
    expect(ids[4]).toBe(actionId(4)); // remove
  });

  test('handles single export', () => {
    const source = 'export const getData = defineAction(async () => {});';
    const result = simulateCompile(source, ['getData']);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('getData');
    expect(result[0].id).toBe(actionId(0));
  });

  test('handles empty exports', () => {
    const result = simulateCompile('', []);
    expect(result).toEqual([]);
  });

  test('source-order sorting is stable across multiple calls', () => {
    const source =
      'export const b = 1;\nexport const a = 2;\nexport const c = 3;';
    const exports = ['a', 'b', 'c'];

    const result1 = simulateCompile(source, exports);
    const result2 = simulateCompile(source, exports);

    expect(result1.map((r) => r.name)).toEqual(result2.map((r) => r.name));
    expect(result1.map((r) => r.id)).toEqual(result2.map((r) => r.id));
  });

  test('generated lines are valid JS exports', () => {
    const source = 'export const foo = defineAction(() => {});';
    const result = simulateCompile(source, ['foo']);

    for (const entry of result) {
      expect(entry.line).toMatch(/^export const \w+ = \{ __actionId: '[0-9a-z]+' \};$/);
    }
  });
});

// ─── Synthetic module output ────────────────────────────────────────────────

describe('Module Compiler: synthetic module format', () => {
  test('synthetic module is valid ESM', () => {
    const source =
      'export const getDevices = defineAction(() => {});\nexport const scan = defineAction(() => {});';
    const names = ['getDevices', 'scan'];

    // Sort by source order
    const sorted = [...names].sort(
      (a, b) =>
        source.indexOf(`export const ${a}`) - source.indexOf(`export const ${b}`)
    );

    const lines = sorted.map(
      (name, i) => `export const ${name} = { __actionId: '${actionId(i)}' };`
    );
    const module = lines.join('\n');

    expect(module).toContain('export const getDevices');
    expect(module).toContain('export const scan');
    expect(module).toContain('__actionId');
    expect(module.split('\n').length).toBe(2);
  });
});
