import { resolve } from 'node:path';

/**
 * Resolve a user-supplied path relative to a base directory,
 * ensuring the result stays within that directory.
 *
 * Returns the resolved absolute path, or `null` if the path
 * escapes the base directory or is empty.
 *
 * @example
 * ```ts
 * safePath('/plugins/foo/assets', 'images/logo.png')
 * // → '/plugins/foo/assets/images/logo.png'
 *
 * safePath('/plugins/foo/assets', '../../etc/passwd')
 * // → null
 * ```
 */
export function safePath(baseDir: string, relativePath: string): string | null {
  if (!relativePath) return null;

  const base = resolve(baseDir);
  const full = resolve(base, relativePath);

  // The resolved path must be strictly inside the base directory
  if (!full.startsWith(base + '/')) {
    return null;
  }

  return full;
}
