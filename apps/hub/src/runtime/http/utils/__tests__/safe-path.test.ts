import { describe, expect, test } from 'bun:test';
import { safePath } from '../safe-path';

describe('safePath', () => {
  const base = '/plugins/foo/assets';

  test('resolves a simple relative path', () => {
    expect(safePath(base, 'images/logo.png')).toBe('/plugins/foo/assets/images/logo.png');
  });

  test('resolves a nested path', () => {
    expect(safePath(base, 'a/b/c/d.txt')).toBe('/plugins/foo/assets/a/b/c/d.txt');
  });

  test('resolves a file in the root of base', () => {
    expect(safePath(base, 'readme.md')).toBe('/plugins/foo/assets/readme.md');
  });

  // ── Traversal attacks ────────────────────────────────────────────────────

  test('rejects simple ../ traversal', () => {
    expect(safePath(base, '../secret.txt')).toBeNull();
  });

  test('rejects deep ../ traversal', () => {
    expect(safePath(base, '../../../etc/passwd')).toBeNull();
  });

  test('rejects traversal hidden inside a valid prefix', () => {
    expect(safePath(base, 'images/../../secret.txt')).toBeNull();
  });

  test('rejects traversal that resolves exactly to base (no file)', () => {
    expect(safePath(base, '.')).toBeNull();
  });

  test('rejects traversal through multiple ../..', () => {
    expect(safePath(base, 'a/b/../../../../etc/passwd')).toBeNull();
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  test('rejects empty string', () => {
    expect(safePath(base, '')).toBeNull();
  });

  test('allows filenames containing double dots (not traversal)', () => {
    // "file..txt" is a legitimate filename — not a traversal
    expect(safePath(base, 'file..txt')).toBe('/plugins/foo/assets/file..txt');
  });

  test('allows paths with single dots (current dir)', () => {
    expect(safePath(base, './images/logo.png')).toBe('/plugins/foo/assets/images/logo.png');
  });

  test('handles absolute paths in relativePath (treated as escape)', () => {
    // path.resolve('/base', '/etc/passwd') → '/etc/passwd'
    expect(safePath(base, '/etc/passwd')).toBeNull();
  });
});
