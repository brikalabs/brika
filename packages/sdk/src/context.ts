/**
 * Global Plugin Context
 *
 * Manages plugin lifecycle and block registration for event-driven blocks.
 */

import { type Client, createClient, type Json } from '@brika/ipc';
import {
  callTool,
  emit as emitMsg,
  event as eventMsg,
  log as logMsg,
  ping,
  registerBlock,
  registerTool,
  subscribe as subscribeMsg,
  unsubscribe as unsubscribeMsg,
} from '@brika/ipc/contract';
import { z } from 'zod';
import type {
  BlockHandlers,
  BlockSchema,
  CompiledBlock,
  LowLevelBlockContext,
  Serializable,
  StateStore,
} from './blocks';
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
type EventHandler = (event: { type: string; payload: Json }) => void;
type StopHandler = () => void | Promise<void>;

interface ToolDecl {
  id: string;
  description?: string;
  icon?: string;
  color?: string;
}

interface BlockDecl {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
}

interface Manifest {
  name: string;
  version: string;
  tools?: ToolDecl[];
  blocks?: BlockDecl[];
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory State Store
// ─────────────────────────────────────────────────────────────────────────────

class MemoryStateStore implements StateStore {
  readonly #data = new Map<string, Serializable>();

  get<T extends Serializable = Serializable>(key: string): T | undefined {
    return this.#data.get(key) as T | undefined;
  }

  set(key: string, value: Serializable): void {
    this.#data.set(key, value);
  }

  has(key: string): boolean {
    return this.#data.has(key);
  }

  delete(key: string): boolean {
    return this.#data.delete(key);
  }

  clear(): void {
    this.#data.clear();
  }

  keys(): string[] {
    return Array.from(this.#data.keys());
  }

  getAll(): Record<string, Serializable> {
    return Object.fromEntries(this.#data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadManifest(): Manifest {
  // Walk up from entry file to find package.json
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
// Block Instance for IPC
// ─────────────────────────────────────────────────────────────────────────────

interface BlockInstance {
  block: CompiledBlock;
  state: StateStore;
  timers: Set<ReturnType<typeof setTimeout>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

class Context {
  readonly #manifest: Manifest;
  readonly #client: Client;
  readonly #declaredTools: Set<string>;
  readonly #declaredBlocks: Set<string>;
  readonly #toolMeta: Map<string, ToolDecl>;
  readonly #blockMeta: Map<string, BlockDecl>;
  readonly #tools = new Map<string, ToolHandler>();
  readonly #blocks = new Map<string, CompiledBlock>();
  readonly #blockInstances = new Map<string, BlockInstance>(); // workflowId:blockId -> instance
  readonly #eventSubs = new Map<string, Set<EventHandler>>();
  readonly #stopHandlers = new Set<StopHandler>();
  #started = false;

  constructor() {
    this.#manifest = loadManifest();
    this.#client = createClient();
    this.#declaredTools = new Set(this.#manifest.tools?.map((t) => t.id) ?? []);
    this.#declaredBlocks = new Set(this.#manifest.blocks?.map((b) => b.id) ?? []);
    this.#toolMeta = new Map(this.#manifest.tools?.map((t) => [t.id, t]));
    this.#blockMeta = new Map(this.#manifest.blocks?.map((b) => [b.id, b]));

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

  /**
   * Register an event-driven block.
   */
  useBlock(block: CompiledBlock): { id: string } {
    const { id } = block;
    if (!this.#declaredBlocks.has(id)) {
      throw new Error(`Block "${id}" not in package.json. Add: "blocks": [{"id": "${id}"}]`);
    }
    if (this.#blocks.has(id)) throw new Error(`Block "${id}" already registered`);

    const meta = this.#blockMeta.get(id);

    // Merge metadata from package.json
    const finalBlock: CompiledBlock = {
      ...block,
      name: block.name || meta?.name || id,
      description: block.description || meta?.description || '',
      category: block.category || meta?.category || 'action',
      icon: block.icon || meta?.icon || 'box',
      color: block.color || meta?.color || '#6b7280',
    };

    this.#blocks.set(id, finalBlock);

    // Convert BlockPort[] to simpler format for IPC
    const inputs = finalBlock.inputs.map((p) => ({
      id: p.id,
      name: p.nameKey,
    }));
    const outputs = finalBlock.outputs.map((p) => ({
      id: p.id,
      name: p.nameKey,
    }));

    this.#client.send(registerBlock, {
      block: {
        id,
        name: finalBlock.name,
        description: finalBlock.description,
        category: finalBlock.category,
        icon: finalBlock.icon,
        color: finalBlock.color,
        inputs,
        outputs,
        schema: finalBlock.schema as unknown as Record<string, Json>,
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

    // Handle block lifecycle events from hub
    this.#client.on(eventMsg, ({ event }) => {
      const { type, payload } = event;

      // Handle block lifecycle events
      if (type === 'block.start') {
        this.#handleBlockStart(
          payload as {
            workflowId: string;
            blockId: string;
            blockType: string;
            config: Record<string, unknown>;
          }
        );
      } else if (type === 'block.input') {
        this.#handleBlockInput(
          payload as { workflowId: string; blockId: string; portId: string; data: Serializable }
        );
      } else if (type === 'block.stop') {
        this.#handleBlockStop(payload as { workflowId: string; blockId: string });
      }

      // Regular event subscriptions
      for (const [pattern, handlers] of this.#eventSubs) {
        if (this.#matchPattern(pattern, type)) {
          for (const h of handlers) h({ type, payload });
        }
      }
    });

    this.#client.onStop(async () => {
      // Stop all block instances
      for (const instance of this.#blockInstances.values()) {
        for (const timer of instance.timers) {
          clearTimeout(timer);
          clearInterval(timer);
        }
      }
      this.#blockInstances.clear();

      for (const h of this.#stopHandlers) await h();
    });
  }

  #handleBlockStart(payload: {
    workflowId: string;
    blockId: string;
    blockType: string;
    config: Record<string, unknown>;
  }) {
    const block = this.#blocks.get(payload.blockType);
    if (!block) {
      this.log('error', `Unknown block type: ${payload.blockType}`);
      return;
    }

    const instanceKey = `${payload.workflowId}:${payload.blockId}`;

    // Create instance
    const instance: BlockInstance = {
      block,
      state: new MemoryStateStore(),
      timers: new Set(),
    };
    this.#blockInstances.set(instanceKey, instance);

    // Create context and call onStart
    const ctx = this.#createBlockContext(
      payload.workflowId,
      payload.blockId,
      payload.config,
      instance
    );
    block.handlers.onStart?.(ctx);
  }

  #handleBlockInput(payload: {
    workflowId: string;
    blockId: string;
    portId: string;
    data: Serializable;
  }) {
    const instanceKey = `${payload.workflowId}:${payload.blockId}`;
    const instance = this.#blockInstances.get(instanceKey);
    if (!instance) {
      this.log('warn', `Block input for unknown instance: ${instanceKey}`);
      return;
    }

    // Get config from state (stored during start)
    const config = (instance.state.get('__config') as Record<string, Serializable>) ?? {};
    const ctx = this.#createBlockContext(payload.workflowId, payload.blockId, config, instance);
    instance.block.handlers.onInput(payload.portId, payload.data, ctx);
  }

  #handleBlockStop(payload: { workflowId: string; blockId: string }) {
    const instanceKey = `${payload.workflowId}:${payload.blockId}`;
    const instance = this.#blockInstances.get(instanceKey);
    if (!instance) return;

    // Clear timers
    for (const timer of instance.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }

    // Get config and call onStop
    const config = (instance.state.get('__config') as Record<string, Serializable>) ?? {};
    const ctx = this.#createBlockContext(payload.workflowId, payload.blockId, config, instance);
    instance.block.handlers.onStop?.(ctx);

    this.#blockInstances.delete(instanceKey);
  }

  #createBlockContext(
    workflowId: string,
    blockId: string,
    config: Record<string, unknown>,
    instance: BlockInstance
  ): LowLevelBlockContext {
    // Store config for later use
    instance.state.set('__config', config as Serializable);

    return {
      blockId,
      workflowId,
      config,
      state: instance.state,

      emit: (portId: string, data: Serializable) => {
        // Send emit event to hub
        this.#client.send(emitMsg, {
          eventType: 'block.emit',
          payload: { workflowId, blockId, portId, data } as unknown as Json,
        });
      },

      log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => {
        this.log(level, `[${blockId}] ${message}`);
      },

      callTool: (toolId: string, _args: Record<string, Serializable>) => {
        // TODO: Implement tool calling via IPC
        this.log('warn', `callTool not implemented: ${toolId}`);
        return Promise.resolve(null);
      },

      setTimeout: (callback: () => void, ms: number) => {
        const timer = setTimeout(() => {
          instance.timers.delete(timer);
          callback();
        }, ms);
        instance.timers.add(timer);
        return () => {
          clearTimeout(timer);
          instance.timers.delete(timer);
        };
      },

      setInterval: (callback: () => void, ms: number) => {
        const timer = setInterval(callback, ms);
        instance.timers.add(timer);
        return () => {
          clearInterval(timer);
          instance.timers.delete(timer);
        };
      },
    };
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

export type { ToolHandler, EventHandler, StopHandler };
