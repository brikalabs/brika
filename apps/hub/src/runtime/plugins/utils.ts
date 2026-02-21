import { join } from 'node:path';
import { semver } from '@/runtime/utils';

// Re-export hub version from centralized module
export { HUB_VERSION } from '../../hub';

/**
 * Get current timestamp in milliseconds.
 */
export function now(): number {
  return Date.now();
}

/**
 * Generate a deterministic UID from the plugin name.
 * Uses Bun.hash (64-bit) converted to base36 for a stable, URL-safe identifier.
 */
export function generateUid(pluginName: string): string {
  const hash = Bun.hash(pluginName);
  return hash.toString(36);
}

/** Check if a version satisfies a semver range. */
export function satisfiesVersion(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}

/**
 * Ensure a tsconfig.json with inline `jsxImportSource` exists in the plugin root.
 *
 * Bun does NOT resolve the `extends` field in tsconfig.json, so even plugins
 * that extend `@brika/sdk/tsconfig.plugin.json` will fall back to `react`
 * unless `jsxImportSource` is specified directly.
 */
export async function ensurePluginTsconfig(rootDirectory: string): Promise<void> {
  try {
    const tsconfigPath = join(rootDirectory, 'tsconfig.json');
    const file = Bun.file(tsconfigPath);

    if (await file.exists()) {
      const raw = await file.json();
      if (raw?.compilerOptions?.jsxImportSource) return;

      // Bun ignores extends — inline the critical JSX settings
      raw.compilerOptions = raw.compilerOptions ?? {};
      raw.compilerOptions.jsx = 'react-jsx';
      raw.compilerOptions.jsxImportSource = '@brika/sdk';
      await Bun.write(tsconfigPath, JSON.stringify(raw, null, 2));
      return;
    }

    await Bun.write(
      tsconfigPath,
      JSON.stringify(
        {
          extends: '@brika/sdk/tsconfig.plugin.json',
          compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@brika/sdk' },
        },
        null,
        2
      )
    );
  } catch {
    // Non-critical — plugin may still work if it doesn't use JSX.
  }
}
