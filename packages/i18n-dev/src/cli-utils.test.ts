import { describe, expect, it } from 'bun:test';
import { cliFlag } from './cli-utils';

describe('cliFlag', () => {
  const originalArgv = process.argv;

  it('returns the flag value when present', () => {
    process.argv = ['node', 'script.ts', '--locales', '/path/to/locales'];
    expect(cliFlag('--locales', '/default')).toBe('/path/to/locales');
    process.argv = originalArgv;
  });

  it('returns fallback when flag is absent', () => {
    process.argv = ['node', 'script.ts'];
    expect(cliFlag('--locales', '/default')).toBe('/default');
    process.argv = originalArgv;
  });

  it('returns fallback when flag value is missing', () => {
    process.argv = ['node', 'script.ts', '--locales'];
    expect(cliFlag('--locales', '/default')).toBe('/default');
    process.argv = originalArgv;
  });

  it('handles multiple flags correctly', () => {
    process.argv = ['node', 'script.ts', '--out', '/output', '--locales', '/locales'];
    expect(cliFlag('--out', 'x')).toBe('/output');
    expect(cliFlag('--locales', 'x')).toBe('/locales');
    expect(cliFlag('--missing', 'fallback')).toBe('fallback');
    process.argv = originalArgv;
  });
});
