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

import type {
  BlockManifest,
  BrickManifest,
  PageManifest,
  SparkManifest,
} from './manifests';

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
  | 'crash-loop';

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
  author: string | { name: string; email?: string; url?: string } | null;
  /** Homepage URL */
  homepage: string | null;
  /** Repository URL or object */
  repository: string | { type?: string; url: string; directory?: string } | null;
  /** Path to icon file */
  icon: string | null;
  /** Keywords for search/categorization */
  keywords: string[];
  /** License identifier */
  license: string | null;
  /** Engine compatibility requirements */
  engines: { brika: string };

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
  /** Last error message if crashed */
  lastError: string | null;

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

/** Check if type is generic (accepts any type) */
function isGenericType(t?: string): boolean {
  return !t || t.startsWith('generic') || t === 'unknown' || t === 'any';
}

/**
 * Check if two port types are compatible for connection.
 * Returns true if source type can flow into target type.
 */
export function arePortTypesCompatible(sourceType?: string, targetType?: string): boolean {
  if (isGenericType(sourceType) || isGenericType(targetType)) return true;

  const normalizeType = (t: string) => t.toLowerCase().trim();
  const src = normalizeType(sourceType ?? '');
  const tgt = normalizeType(targetType ?? '');

  if (src === tgt) return true;

  const numberTypes = new Set(['number', 'integer', 'float', 'double']);
  if (numberTypes.has(src) && numberTypes.has(tgt)) return true;

  if (tgt === 'string' && new Set(['number', 'integer', 'boolean']).has(src)) return true;

  const objectTypes = new Set(['object', 'json', 'record', 'any']);
  if (objectTypes.has(src) && objectTypes.has(tgt)) return true;

  if (src.endsWith('[]') && tgt.endsWith('[]')) {
    const srcBase = src.slice(0, -2);
    const tgtBase = tgt.slice(0, -2);
    return arePortTypesCompatible(srcBase, tgtBase);
  }

  return false;
}
