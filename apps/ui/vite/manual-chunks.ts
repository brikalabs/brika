/**
 * Rollup `manualChunks` strategy: give every `node_modules` dependency its
 * own `vendor/<pkg>` chunk. Browser caches then only invalidate for the
 * package that actually changed between builds — important for the UI
 * bundle whose vendor set is large but mostly stable.
 *
 * Returns `undefined` for app code so Rollup falls back to its default
 * chunking heuristics.
 */
export function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }
  const segments = id.split('node_modules/').pop()?.split('/') ?? [];
  const scope = segments[0] ?? '';
  const name = segments[1] ?? '';
  const pkgName = scope.startsWith('@') ? `${scope}/${name}` : scope;
  return `vendor/${pkgName}`;
}
