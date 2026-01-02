export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSource = "hub" | "plugin" | "installer" | "registry" | "stderr" | "automation";

export interface LogEvent {
  ts: number;
  level: LogLevel;
  source: LogSource;
  pluginRef?: string;
  message: string;
  meta?: Record<string, Json>;
}

export type PluginHealth =
  | "running"
  | "stopped"
  | "crashed"
  | "degraded"
  | "installing"
  | "updating"
  | "restarting"
  | "crash-loop";

/** Plugin metadata from package.json */
export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  repository?: string | { type?: string; url: string };
  icon?: string;
  keywords?: string[];
  license?: string;
  dependencies?: Record<string, string>;
}

export interface PluginSummary {
  /** Installation reference (e.g., file:path or npm:package) */
  ref: string;
  /** Plugin ID from package.json name field (human-readable, used in YAML configs) */
  id?: string;
  /** Short unique ID for URLs (no encoding needed) */
  uid?: string;
  version?: string;
  pid?: number;
  health: PluginHealth;
  tools: string[];
  blocks?: string[];
  lastError?: string | null;
  /** Full metadata from package.json */
  metadata?: PluginMetadata;
}

/** JSON Schema for tool input - enables smart UI forms */
export interface ToolInputSchema {
  type: "object";
  properties?: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "array" | "object";
      description?: string;
      default?: Json;
      enum?: Json[];
      items?: { type: string };
      required?: boolean;
    }
  >;
  required?: string[];
}

export interface ToolSummary {
  name: string;
  description?: string;
  owner?: string; // plugin ref or "hub"
  inputSchema?: ToolInputSchema;
}

export interface ToolCallContext {
  traceId: string;
  source: "api" | "ui" | "voice" | "rule" | "automation";
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

export type ScheduleTrigger = { type: "cron"; expr: string } | { type: "interval"; ms: number };

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
  | { type: "event"; match: string } // glob pattern e.g. "motion.*"
  | { type: "schedule"; scheduleId: string };

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
