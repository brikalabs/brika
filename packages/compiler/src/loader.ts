/** A Bun loader name, as accepted by `Bun.build` `onLoad` and `Bun.Transpiler`. */
export type Loader = 'tsx' | 'ts' | 'jsx' | 'js';

/**
 * Map a file path to the Bun loader for its extension. The single source of
 * truth shared by every build plugin and transpiler scan in this package, so
 * the extension-to-loader mapping is defined exactly once.
 */
export function pickLoader(path: string): Loader {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.ts')) {
    return 'ts';
  }
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  return 'js';
}
