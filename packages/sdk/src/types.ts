export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

export type AnyObj = Record<string, Json>;

/** JSON Schema for tool input validation and UI generation */
export interface ToolInputSchema {
  type: "object";
  properties?: Record<string, {
    type: "string" | "number" | "boolean" | "array" | "object";
    description?: string;
    default?: Json;
    enum?: Json[];
    items?: { type: string };
    required?: boolean;
  }>;
  required?: string[];
}

export interface ToolSpec {
  /** Local tool ID (without plugin prefix, e.g., "set", "list") */
  id: string;
  description?: string;
  /** JSON Schema for input arguments - enables smart UI forms */
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

export interface PluginInfo {
  id: string;
  version: string;
  requires?: {
    hub?: string;
    sdk?: string;
  };
}

export type EventHandler = (event: { id: string; type: string; source: string; payload: Json; ts: number }) => void | Promise<void>;

export interface PluginApi {
  registerTool(
    tool: ToolSpec,
    handler: (args: AnyObj, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult
  ): void;

  onStop(fn: () => void | Promise<void>): void;

  log(level: "debug" | "info" | "warn" | "error", message: string, meta?: AnyObj): void;

  /** Emit an event to the Hub event bus */
  emit(eventType: string, payload?: Json): void;

  /** Subscribe to events matching glob patterns (e.g. "light.*", "motion.detected") */
  on(patterns: string | string[], handler: EventHandler): void;

  /** Unsubscribe from event patterns */
  off(patterns: string | string[]): void;
}
