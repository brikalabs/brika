import { describe, expect, test } from 'bun:test';
import {
  countExports,
  formatNpmHint,
  formatNpmStatus,
  formatPackageLabel,
  getBinNames,
  getHooks,
} from '../package-preview';

// ---------------------------------------------------------------------------
// formatPackageLabel
// ---------------------------------------------------------------------------

describe('formatPackageLabel', () => {
  test('includes package name in output', () => {
    const label = formatPackageLabel('@brika/sdk', '1.0.0');
    expect(label).toContain('@brika/sdk');
  });

  test('includes version in output', () => {
    const label = formatPackageLabel('my-pkg', '2.3.4');
    expect(label).toContain('2.3.4');
  });

  test('includes @ separator before version', () => {
    const label = formatPackageLabel('create-brika', '0.1.0');
    expect(label).toContain('@0.1.0');
  });
});

// ---------------------------------------------------------------------------
// formatNpmHint
// ---------------------------------------------------------------------------

describe('formatNpmHint', () => {
  test('shows "new" for unpublished packages', () => {
    const hint = formatNpmHint(null);
    expect(hint).toContain('npm:');
    expect(hint).toContain('new');
  });

  test('shows version for published packages', () => {
    const hint = formatNpmHint('1.2.3');
    expect(hint).toContain('npm:');
    expect(hint).toContain('1.2.3');
  });
});

// ---------------------------------------------------------------------------
// formatNpmStatus — additional edge cases
// ---------------------------------------------------------------------------

describe('formatNpmStatus', () => {
  test('returns "not yet published" for null', () => {
    const output = formatNpmStatus('1.0.0', null);
    expect(output).toContain('not yet published');
  });

  test('warns when published version matches local', () => {
    const output = formatNpmStatus('2.0.0', '2.0.0');
    expect(output).toContain('already published');
  });

  test('returns the published version string when it differs', () => {
    const output = formatNpmStatus('2.0.0', '1.5.0');
    expect(output).toBe('1.5.0');
  });
});

// ---------------------------------------------------------------------------
// countExports — additional edge cases
// ---------------------------------------------------------------------------

describe('countExports', () => {
  test('returns 1 for a string export', () => {
    expect(countExports('./index.js')).toBe(1);
  });

  test('returns 1 for null', () => {
    expect(countExports(null)).toBe(1);
  });

  test('returns 1 for undefined', () => {
    expect(countExports(undefined)).toBe(1);
  });

  test('returns 1 for a number', () => {
    expect(countExports(42)).toBe(1);
  });

  test('returns 0 for empty object', () => {
    expect(countExports({})).toBe(0);
  });

  test('counts keys for an exports map', () => {
    expect(
      countExports({ '.': './index.js', './utils': './utils.js', './types': './types.js' })
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getBinNames — additional edge cases
// ---------------------------------------------------------------------------

describe('getBinNames', () => {
  test('returns empty array for undefined bin', () => {
    expect(getBinNames('pkg', undefined)).toEqual([]);
  });

  test('returns package name for string shorthand bin', () => {
    expect(getBinNames('my-tool', './cli.js')).toEqual(['my-tool']);
  });

  test('returns multiple keys for object bin', () => {
    expect(getBinNames('pkg', { a: './a.js', b: './b.js', c: './c.js' })).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// getHooks — additional edge cases
// ---------------------------------------------------------------------------

describe('getHooks', () => {
  test('returns empty array for undefined scripts', () => {
    expect(getHooks(undefined)).toEqual([]);
  });

  test('returns empty array for empty scripts object', () => {
    expect(getHooks({})).toEqual([]);
  });

  test('detects prepublishOnly hook', () => {
    expect(getHooks({ prepublishOnly: 'tsc', dev: 'bun run dev' })).toEqual(['prepublishOnly']);
  });

  test('detects build hook', () => {
    expect(getHooks({ build: 'bun run build', test: 'bun test' })).toEqual(['build']);
  });

  test('detects both hooks in order', () => {
    expect(getHooks({ prepublishOnly: 'tsc', build: 'bun run generate' })).toEqual([
      'prepublishOnly',
      'build',
    ]);
  });

  test('ignores irrelevant scripts', () => {
    expect(getHooks({ dev: 'bun run src', lint: 'eslint .' })).toEqual([]);
  });
});
