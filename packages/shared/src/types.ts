export type Json = null | boolean | number | string | undefined | Json[] | { [k: string]: Json };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'hub' | 'plugin' | 'installer' | 'registry' | 'stderr' | 'automation';

export interface LogEvent {
  ts: number;
  level: LogLevel;
  source: LogSource;
  pluginRef?: string;
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

/** Tool manifest from package.json */
export interface ToolManifest {
  id: string;
  description?: string;
  icon?: string;
  color?: string;
}

/** Block manifest from package.json */
export interface BlockManifest {
  id: string;
  name?: string;
  description?: string;
  category?: 'trigger' | 'flow' | 'action' | 'transform';
  icon?: string;
  color?: string;
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
  engines: { elia: string };

  // ─── Installation ──────────────────────────────────────────────────────────
  /** Installation reference (e.g., "file:/path/to/plugin/src/main.ts") */
  ref: string;
  /** Installation directory (e.g., "/path/to/plugin") */
  dir: string;

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
  /** Available tools */
  tools: ToolManifest[];
  /** Available blocks */
  blocks: BlockManifest[];

  // ─── i18n ───────────────────────────────────────────────────────────────────
  /** Available translation locales (e.g., ["en", "fr", "fr-CH"]) */
  locales: string[];
}

/** JSON Schema for tool input - enables smart UI forms */
export interface ToolInputSchema {
  type: 'object';
  properties?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description?: string;
      default?: Json;
      enum?: Json[];
      items?: { type: string };
      required?: boolean;
    }
  >;
  required?: string[];
}

/** Runtime tool info (includes schema from running plugin) */
export interface ToolSummary {
  /** Full tool ID (e.g., "@brika/plugin-timer:set") */
  id: string;
  /** Tool description */
  description?: string;
  /** Lucide icon name */
  icon?: string;
  /** Hex color */
  color?: string;
  /** Input schema for validation/UI */
  inputSchema?: ToolInputSchema;
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
  inputs?: Array<{ id: string; name: string }>;
  /** Output ports */
  outputs?: Array<{ id: string; name: string }>;
}

export interface ToolCallContext {
  traceId: string;
  source: 'api' | 'ui' | 'voice' | 'rule' | 'automation';
}

export interface ToolResult {
  ok: boolean;
  content?: string;
  data?: Json;
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

export interface EliaEvent {
  id: string;
  type: string; // e.g. "light.changed", "motion.detected"
  source: string; // plugin ref or "hub"
  payload: Json;
  ts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedules
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduleTrigger = { type: 'cron'; expr: string } | { type: 'interval'; ms: number };

export interface Schedule {
  id: string;
  name: string;
  trigger: ScheduleTrigger;
  action: { tool: string; args: Record<string, Json> };
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

export type RuleTrigger =
  | { type: 'event'; match: string } // glob pattern e.g. "motion.*"
  | { type: 'schedule'; scheduleId: string };

export interface RuleAction {
  tool: string;
  args: Record<string, Json>;
}

export interface Rule {
  id: string;
  name: string;
  trigger: RuleTrigger;
  condition?: string; // e.g. "event.payload.brightness < 50"
  actions: RuleAction[];
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Manifest (from package.json)
// ─────────────────────────────────────────────────────────────────────────────

/** Full plugin manifest from package.json */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string | null;
  repository?: string | { type?: string; url: string; directory?: string };
  icon?: string;
  keywords?: string[];
  license?: string;
  engines: { elia: string };
  dependencies?: Record<string, string>;
  tools?: ToolManifest[];
  blocks?: BlockManifest[];
}
