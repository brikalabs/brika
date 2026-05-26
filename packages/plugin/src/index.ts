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

import type { BlockManifest, BrickManifest, PageManifest, SparkManifest } from './manifests';

// Port-type compatibility checking is provided by @brika/type-system.
// Plugin authors and the workflow editor should import `isCompatible`
// (and `parseTypeName` when working with legacy `typeName` strings)
// directly from `@brika/type-system` — that's the single source of
// truth. We re-export `isCompatible` here for ergonomic access from
// plugin code that already imports from `@brika/plugin`.
export { isCompatible } from '@brika/type-system';

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
  | 'incompatible'
  // Plugin is installed and enabled but cannot start because its
  // preferences fail manifest validation (e.g. a required field is
  // empty). The plugin stays in this state until valid preferences
  // are submitted; auto-start triggers on save.
  | 'awaiting-config';

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
  /** Permission families this plugin requests, derived from its grant ids */
  permissions: string[];
  /** Grants declared by this plugin (keyed by reverse-DNS id), with per-grant scope */
  grants: Record<string, unknown>;
  /** Permission families currently granted by the user */
  grantedPermissions: string[];

  // ─── i18n ───────────────────────────────────────────────────────────────────
  /** Available translation locales (e.g., ["en", "fr", "fr-CH"]) */
  locales: string[];
}
