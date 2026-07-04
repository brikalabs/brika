/**
 * Transform logic shared by the isolate bundler's rollup hooks. Pure JS, no
 * bundler and no runtime API, so it runs identically under Bun and in a Worker.
 */

import { BRIDGE_GLOBALS } from '@brika/sdk/browser-bridge';
import { injectCallSites } from '../plugins/i18n-call-site/scanner';

/**
 * The bridged specifier a browser module must NOT bundle: the host provides it
 * at `globalThis.__brika.<prop>` at runtime (react, its JSX runtimes, lucide,
 * clsx/cva, the bridged @brika/sdk surfaces). Returns the global property, or
 * undefined when the specifier should be resolved and bundled normally.
 */
export function bridgePropFor(specifier: string): string | undefined {
  return (BRIDGE_GLOBALS as Readonly<Record<string, string>>)[specifier];
}

/** True for a bare package specifier (not relative, not absolute, not virtual). */
export function isBareSpecifier(id: string): boolean {
  return !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0');
}

/**
 * Inject `t()`/`tp()` call-site metadata, exactly as the Bun i18n plugin does,
 * by delegating to the same `injectCallSites` implementation. `relPath` is the
 * source path relative to the build's `sourceRoot`.
 */
export function applyI18n(code: string, relPath: string): string {
  return injectCallSites(code, relPath);
}
