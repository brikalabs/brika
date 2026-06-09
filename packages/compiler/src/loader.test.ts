import { describe, expect, it } from 'bun:test';
import { pickLoader } from './loader';

describe('pickLoader', () => {
  it('maps each extension to its Bun loader', () => {
    expect(pickLoader('a/b/view.tsx')).toBe('tsx');
    expect(pickLoader('a/b/store.ts')).toBe('ts');
    expect(pickLoader('a/b/legacy.jsx')).toBe('jsx');
    expect(pickLoader('a/b/vendor.js')).toBe('js');
  });

  it('falls back to js for unknown or missing extensions', () => {
    expect(pickLoader('Makefile')).toBe('js');
    expect(pickLoader('a/b/data.json')).toBe('js');
  });
});
