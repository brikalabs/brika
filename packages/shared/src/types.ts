export type Json = null | boolean | number | string | undefined | Json[] | { [k: string]: Json };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'hub' | 'plugin' | 'installer' | 'registry' | 'stderr' | 'automation';

export interface LogEvent {
  ts: number;
  level: LogLevel;
  source: LogSource;
  pluginName?: string;
  message: string;
  meta?: Record<string, Json>;
}

export type PluginHealth =
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'degraded'
  | 'installing'
  | 'updating'
  | 'restarting'
  | 'crash-loop';

/** Block manifest from package.json */
export interface BlockManifest {
  id: string;
  name?: string;
  description?: string;
  category?: 'trigger' | 'flow' | 'action' | 'transform';
  icon?: string;
  color?: string;
}

/** Spark (typed event) manifest from package.json */
export interface SparkManifest {
  id: string;
  name?: string;
  description?: string;
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

  // ─── i18n ───────────────────────────────────────────────────────────────────
  /** Available translation locales (e.g., ["en", "fr", "fr-CH"]) */
  locales: string[];
}

/** Runtime block info (includes ports from running plugin) */
export interface BlockSummary {
  /** Full block ID (e.g., "@brika/blocks-builtin:condition") */
  id: string;
  /** Display name */
  name?: string;
  /** Block description */
  description?: string;
  /** Block category */
  category?: 'trigger' | 'flow' | 'action' | 'transform';
  /** Lucide icon name */
  icon?: string;
  /** Hex color */
  color?: string;
  /** Input ports */
  inputs?: Array<{ id: string; name: string; typeName?: string }>;
  /** Output ports */
  outputs?: Array<{ id: string; name: string; typeName?: string }>;
}

export interface StoreSearchResult {
  items: Array<{
    ref: string;
    name: string;
    version: string;
    description?: string;
  }>;
  nextCursor?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export interface BrikaEvent {
  id: string;
  type: string; // e.g. "light.changed", "motion.detected"
  source: string; // plugin ref or "hub"
  payload: Json;
  ts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Manifest (from package.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string | { type?: string; url: string; directory?: string };
  icon?: string;
  keywords?: string[];
  license?: string;
  engines?: { brika?: string };
  main?: string;
  blocks?: BlockManifest[];
  sparks?: SparkManifest[];
  preferences?: PreferenceDefinition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Preferences (Raycast-style configuration)
// ─────────────────────────────────────────────────────────────────────────────

export type PreferenceType = 'text' | 'password' | 'checkbox' | 'dropdown' | 'number';

export interface BasePreference {
  name: string;
  type: PreferenceType;
  required?: boolean;
}

export interface TextPreference extends BasePreference {
  type: 'text';
  default?: string;
}

export interface PasswordPreference extends BasePreference {
  type: 'password';
  default?: string;
}

export interface NumberPreference extends BasePreference {
  type: 'number';
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface CheckboxPreference extends BasePreference {
  type: 'checkbox';
  default?: boolean;
}

export interface DropdownPreference extends BasePreference {
  type: 'dropdown';
  default?: string;
  options: Array<{ value: string }>;
}

export type PreferenceDefinition =
  | TextPreference
  | PasswordPreference
  | NumberPreference
  | CheckboxPreference
  | DropdownPreference;

/** Plugin preferences with schema and current values */
export interface PluginPreferences {
  schema: PreferenceDefinition[];
  values: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Store
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin data from the store (combines npm + verified status + compatibility) */
export interface StorePlugin {
  name: string;
  version: string;
  description: string;
  author: string | { name: string; email?: string };
  keywords: string[];
  repository?: string | { url: string };
  homepage?: string;
  license?: string;
  engines?: { brika?: string };
  verified: boolean;
  verifiedAt?: string;
  featured?: boolean;
  compatible: boolean;
  compatibilityReason?: string;
  installed: boolean;
  installedVersion?: string;
  npm: {
    downloads: number;
    publishedAt: string;
  };
}

/** Verified plugin entry from GitHub registry */
export interface VerifiedPlugin {
  name: string;
  verifiedAt: string;
  verifiedBy: string;
  minVersion?: string;
  featured?: boolean;
  category?: string;
}

/** Verified plugins list from GitHub registry */
export interface VerifiedPluginsList {
  plugins: VerifiedPlugin[];
  version: string;
  lastUpdated: string;
}

/** npm package data from registry API */
export interface NpmPackageData {
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string };
  keywords?: string[];
  repository?: string | { type?: string; url: string; directory?: string };
  homepage?: string;
  license?: string;
  engines?: { brika?: string };
  date?: string;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  score?: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
}

/** npm search result from registry API */
export interface NpmSearchResult {
  package: NpmPackageData;
  downloadCount?: number;
  installed?: boolean;
  installedVersion?: string;
}

/** Compatibility check result */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
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
  // If either is generic/unknown, allow connection
  if (isGenericType(sourceType) || isGenericType(targetType)) return true;

  // Normalize types for comparison
  const normalizeType = (t: string) => t.toLowerCase().trim();
  const src = normalizeType(sourceType!);
  const tgt = normalizeType(targetType!);

  // Exact match
  if (src === tgt) return true;

  // Number compatibility (number, integer)
  const numberTypes = ['number', 'integer', 'float', 'double'];
  if (numberTypes.includes(src) && numberTypes.includes(tgt)) return true;

  // String can accept most primitive types (implicit toString)
  if (tgt === 'string' && ['number', 'integer', 'boolean'].includes(src)) return true;

  // JSON/object types are flexible
  const objectTypes = ['object', 'json', 'record', 'any'];
  if (objectTypes.includes(src) && objectTypes.includes(tgt)) return true;

  // Array compatibility - check if base types match
  if (src.endsWith('[]') && tgt.endsWith('[]')) {
    const srcBase = src.slice(0, -2);
    const tgtBase = tgt.slice(0, -2);
    return arePortTypesCompatible(srcBase, tgtBase);
  }

  return false;
}
