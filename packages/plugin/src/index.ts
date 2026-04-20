/**
 * @brika/plugin — core plugin types, manifests, preferences, and port compatibility.
 *
 * Defines the plugin system types:
 * - Runtime Plugin representation (hub ↔ UI API contract)
 * - Capability manifests (blocks, sparks, bricks, pages)
 * - Preference/configuration system
 * - Port type compatibility checking for workflow connections
 */

export * from './manifests';
export * from './preferences';
export * from './store';

import { isCompatible, T, type TypeDescriptor } from '@brika/type-system';
import type { BlockManifest, BrickManifest, PageManifest, SparkManifest } from './manifests';

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Health & Runtime Representation
// ─────────────────────────────────────────────────────────────────────────────

export type PluginHealth =
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'degraded'
  | 'installing'
  | 'updating'
  | 'restarting'
  | 'crash-loop'
  | 'incompatible';

/**
 * Structured error with i18n support.
 *
 * - `key`: i18n translation key (e.g. `"plugins:errors.incompatibleVersion"`)
 * - `params`: interpolation parameters for the key
 * - `message`: pre-built English fallback (used in logs and when translations are unavailable)
 */
export interface PluginError {
  key: string;
  params?: Record<string, string>;
  message: string;
}

/** Plugin representation - flattened for easy consumption */
export interface Plugin {
  // ─── Identity ──────────────────────────────────────────────────────────────
  /** Short unique ID - primary identifier */
  uid: string;
  /** Plugin name from package.json (e.g. "@brika/blocks-builtin") */
  name: string;
  /** Plugin version */
  version: string;

  // ─── Metadata (inlined from package.json) ──────────────────────────────────
  /** Human-readable display name */
  displayName: string | null;
  /** Human-readable description */
  description: string | null;
  /** Author name or object */
  author:
    | string
    | {
        name: string;
        email?: string;
        url?: string;
      }
    | null;
  /** Homepage URL */
  homepage: string | null;
  /** Repository URL or object */
  repository:
    | string
    | {
        type?: string;
        url: string;
        directory?: string;
      }
    | null;
  /** Path to icon file */
  icon: string | null;
  /** Keywords for search/categorization */
  keywords: string[];
  /** License identifier */
  license: string | null;
  /** Engine compatibility requirements */
  engines: {
    brika: string;
  };

  // ─── Installation ──────────────────────────────────────────────────────────
  /** Plugin root directory where package.json lives */
  rootDirectory: string;
  /** Entry point file path (absolute) */
  entryPoint: string;

  // ─── Runtime ───────────────────────────────────────────────────────────────
  /** Current status */
  status: PluginHealth;
  /** Process ID (null when stopped) */
  pid: number | null;
  /** Timestamp when plugin was started (null when stopped) */
  startedAt: number | null;
  /** Last error (structured with i18n key, params, and English fallback) */
  lastError: PluginError | null;

  // ─── Capabilities ──────────────────────────────────────────────────────────
  /** Available blocks */
  blocks: BlockManifest[];
  /** Available sparks (typed events) */
  sparks: SparkManifest[];
  /** Available bricks (board UI) */
  bricks: BrickManifest[];
  /** Custom pages provided by this plugin */
  pages: PageManifest[];

  // ─── Permissions ──────────────────────────────────────────────────────────
  /** Permissions declared by this plugin (from package.json) */
  permissions: string[];
  /** Permissions currently granted by the user */
  grantedPermissions: string[];

  // ─── i18n ───────────────────────────────────────────────────────────────────
  /** Available translation locales (e.g., ["en", "fr", "fr-CH"]) */
  locales: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Port Type Compatibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if two port types are compatible for connection.
 * Returns true if source type can flow into target type.
 *
 * @deprecated Use `isCompatible()` from `@brika/type-system` instead.
 * This function delegates to the structural type checker.
 */
export function arePortTypesCompatible(sourceType?: string, targetType?: string): boolean {
  return isCompatible(parseTypeName(sourceType), parseTypeName(targetType));
}

// Re-export for consumers migrating to @brika/type-system
export { isCompatible } from '@brika/type-system';

/** Parse a typeName string to a TypeDescriptor for backward compatibility */
function parseTypeName(typeName?: string): TypeDescriptor {
  if (!typeName) {
    return T.generic();
  }
  if (typeName.startsWith('generic') || typeName === 'unknown' || typeName === 'any') {
    return T.generic();
  }
  const lower = typeName.toLowerCase().trim();
  if (lower === 'string') {
    return T.string;
  }
  if (['number', 'integer', 'float', 'double'].includes(lower)) {
    return T.number;
  }
  if (lower === 'boolean') {
    return T.boolean;
  }
  if (lower === 'null') {
    return T.null;
  }
  if (['object', 'json', 'record'].includes(lower)) {
    return T.record(T.unknown);
  }
  if (lower.endsWith('[]')) {
    return T.array(parseTypeName(lower.slice(0, -2)));
  }
  return T.unknown;
}
