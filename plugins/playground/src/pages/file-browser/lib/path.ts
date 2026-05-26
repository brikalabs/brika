/**
 * Path / extension helpers — pure string ops, no FS, no React.
 */

export const ROOT_PATH = '/data';

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function joinPath(base: string, segment: string): string {
  return base.endsWith('/') ? `${base}${segment}` : `${base}/${segment}`;
}
