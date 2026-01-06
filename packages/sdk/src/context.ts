/**
 * Global Plugin Context
 *
 * Manages plugin lifecycle, tools, and events via IPC.
 */

import { type Client, createClient, type Json } from '@brika/ipc';
import {
  callTool,
  emit as emitMsg,
  event as eventMsg,
  log as logMsg,
  ping,
  registerTool,
  subscribe as subscribeMsg,
  unsubscribe as unsubscribeMsg,
} from '@brika/ipc/contract';
import { z } from 'zod';
import type { BlockSchema } from './blocks';
import type { AnyObj, ToolInputSchema, ToolResult } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ToolCallContext = {
  traceId: string;
  source: 'api' | 'ui' | 'voice' | 'rule' | 'automation';
};
type ToolHandler = (args: AnyObj, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult;
export type EventHandler = (event: { type: string; payload: Json }) => void;
type StopHandler = () => void | Promise<void>;

interface ToolDecl {
  id: string;
  description?: string;
  icon?: string;
  color?: string;
}

interface Manifest {
  name: string;
  version: string;
  tools?: ToolDecl[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadManifest(): Manifest {
  let dir = Bun.main.substring(0, Bun.main.lastIndexOf('/'));
  while (dir) {
    try {
      Bun.resolveSync('./package.json', dir);
      return require(`${dir}/package.json`);
    } catch {
      const i = dir.lastIndexOf('/');
      dir = i > 0 ? dir.substring(0, i) : '';
    }
  }
  throw new Error(`No package.json found for ${Bun.main}`);
}

function zodToSchema(schema: z.ZodObject<z.ZodRawShape>): BlockSchema {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' });
  const props =
    (json as { properties?: Record<string, { type?: string; description?: string }> }).properties ??
    {};
  type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array';
  const validTypes = new Set<PropType>(['string', 'number', 'boolean', 'object', 'array']);
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(props).map(([k, v]) => [
        k,
        {
          type: (validTypes.has(v.type as PropType) ? v.type : 'string') as PropType,
          description: v.description,
        },
      ])
    ),
    required: (json as { required?: string[] }).required ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

class Context {
  readonly #manifest: Manifest;
  readonly #client: Client;
  readonly #declaredTools: Set<string>;
  readonly #toolMeta: Map<string, ToolDecl>;
  readonly #tools = new Map<string, ToolHandler>();
  readonly #eventSubs = new Map<string, Set<EventHandler>>();
  readonly #stopHandlers = new Set<StopHandler>();
  #started = false;

  constructor() {
    this.#manifest = loadManifest();
    this.#client = createClient();
    this.#declaredTools = new Set(this.#manifest.tools?.map((t) => t.id) ?? []);
    this.#toolMeta = new Map(this.#manifest.tools?.map((t) => [t.id, t]));

    this.#setupIpc();
    process.nextTick(() => !this.#started && this.start());
  }

  start() {
    if (this.#started) return;
    this.#started = true;
    this.#client.start({ id: this.#manifest.name, version: this.#manifest.version });
  }

  log(level: LogLevel, message: string, meta?: AnyObj) {
    this.#client.send(logMsg, { level, message, meta });
  }

  emit(type: string, payload: Json = null) {
    this.#client.send(emitMsg, { eventType: type, payload });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  onStop(fn: StopHandler): () => void {
    this.#stopHandlers.add(fn);
    return () => this.#stopHandlers.delete(fn);
  }

  onEvent(pattern: string, handler: EventHandler): () => void {
    const set = this.#eventSubs.get(pattern) ?? new Set();
    set.add(handler);
    this.#eventSubs.set(pattern, set);
    this.#client.send(subscribeMsg, { patterns: [pattern] });
    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.#eventSubs.delete(pattern);
        this.#client.send(unsubscribeMsg, { patterns: [pattern] });
      }
    };
  }

  registerTool<T extends z.ZodObject<z.ZodRawShape>>(
    spec: { id: string; description?: string; schema: T },
    handler: (args: z.infer<T>, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult
  ): { id: string } {
    const { id, description, schema } = spec;
    if (!this.#declaredTools.has(id)) {
      throw new Error(`Tool "${id}" not in package.json. Add: "tools": [{"id": "${id}"}]`);
    }
    if (this.#tools.has(id)) throw new Error(`Tool "${id}" already registered`);

    const meta = this.#toolMeta.get(id);
    this.#tools.set(id, (args, ctx) => {
      const r = schema.safeParse(args);
      if (!r.success) return { ok: false, content: r.error.message };
      return handler(r.data, ctx);
    });

    this.#client.send(registerTool, {
      tool: {
        id,
        description: description ?? meta?.description,
        icon: meta?.icon,
        color: meta?.color,
        inputSchema: zodToSchema(schema) as ToolInputSchema,
      },
    });
    return { id };
  }

  #setupIpc() {
    this.#client.implement(ping, ({ ts }) => ({ ts }));

    this.#client.implement(callTool, async ({ tool, args, ctx }) => {
      const handler = this.#tools.get(tool);
      if (!handler) return { ok: false, content: `Unknown tool: ${tool}` };
      try {
        return (await handler(args as AnyObj, ctx)) ?? { ok: true };
      } catch (e) {
        return { ok: false, content: String(e) };
      }
    });

    this.#client.on(eventMsg, ({ event }) => {
      const { type, payload } = event;
      for (const [pattern, handlers] of this.#eventSubs) {
        if (this.#matchPattern(pattern, type)) {
          for (const h of handlers) h({ type, payload });
        }
      }
    });

    this.#client.onStop(async () => {
      for (const h of this.#stopHandlers) await h();
    });
  }

  #matchPattern(pattern: string, text: string): boolean {
    return new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '.*')}$`).test(text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let ctx: Context | null = null;

export function getContext(): Context {
  if (!ctx) {
    if (typeof process.send !== 'function') {
      throw new TypeError('SDK only works in plugin processes spawned by BRIKA hub');
    }
    ctx = new Context();
  }
  return ctx;
}

export type { ToolHandler, StopHandler };
