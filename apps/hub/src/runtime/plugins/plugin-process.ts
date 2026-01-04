import type { Json, PluginChannel } from '@brika/ipc';
import {
  type BlockContext,
  type BlockResult,
  callTool,
  emit,
  event,
  executeBlock,
  hello,
  log,
  ready,
  registerBlock,
  registerTool,
  subscribe,
  type ToolCallContext,
  type ToolResult,
} from '@brika/ipc/contract';
import type { BrikaEvent, Plugin, PluginHealth, PluginManifest } from '@brika/shared';
import { now } from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginProcessConfig {
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export interface PluginProcessCallbacks {
  onReady: (process: PluginProcess) => void;
  onLog: (level: string, message: string, meta?: Record<string, unknown>) => void;
  onTool: (tool: ToolRegistration) => void;
  onBlock: (block: BlockRegistration) => void;
  onEvent: (eventType: string, payload: Json) => void;
  onSubscribe: (patterns: string[], handler: (event: BrikaEvent) => void) => () => void;
  onHeartbeatFailed: (process: PluginProcess, silentMs: number) => void;
  onDisconnect: (process: PluginProcess, error?: Error) => void;
}

export interface ToolRegistration {
  id: string;
  description?: string;
  icon?: string;
  color?: string;
  inputSchema?: unknown;
}

export interface BlockRegistration {
  id: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// PluginProcess - Manages a single running plugin
// ─────────────────────────────────────────────────────────────────────────────

export class PluginProcess {
  readonly ref: string;
  readonly dir: string;
  readonly uid: string;
  readonly name: string;
  readonly version: string;
  readonly metadata: PluginManifest;
  readonly locales: string[];
  readonly startedAt: number;

  readonly #channel: PluginChannel;
  #lastPong: number;
  #heartbeat?: Timer;
  readonly #tools = new Set<string>();
  readonly #blocks = new Set<string>();
  readonly #subscriptions = new Set<string>();
  #eventUnsubs: Array<() => void> = [];
  #stopped = false;

  constructor(
    channel: PluginChannel,
    info: {
      ref: string;
      dir: string;
      uid: string;
      name: string;
      version: string;
      metadata: PluginManifest;
      locales: string[];
    },
    private readonly config: PluginProcessConfig,
    private readonly callbacks: PluginProcessCallbacks
  ) {
    this.#channel = channel;
    this.#lastPong = now();
    this.startedAt = now();

    this.ref = info.ref;
    this.dir = info.dir;
    this.uid = info.uid;
    this.name = info.name;
    this.version = info.version;
    this.metadata = info.metadata;
    this.locales = info.locales;

    this.#setupHandlers();
    this.#startHeartbeat();
  }

  get pid(): number {
    return this.#channel.pid;
  }

  get lastPong(): number {
    return this.#lastPong;
  }

  get tools(): ReadonlySet<string> {
    return this.#tools;
  }

  get blocks(): ReadonlySet<string> {
    return this.#blocks;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC Operations
  // ─────────────────────────────────────────────────────────────────────────

  async callTool(toolName: string, args: Record<string, Json>, ctx: ToolCallContext): Promise<ToolResult> {
    if (this.#stopped) return { ok: false, content: 'Plugin stopped' };
    try {
      return await this.#channel.call(callTool, { tool: toolName, args, ctx });
    } catch (e) {
      return { ok: false, content: String(e) };
    }
  }

  async executeBlock(blockType: string, config: Record<string, Json>, context: BlockContext): Promise<BlockResult> {
    if (this.#stopped) return { error: 'Plugin stopped', stop: true };
    try {
      return await this.#channel.call(executeBlock, { blockType, config, context });
    } catch (e) {
      return { error: String(e), stop: true };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;

    if (this.#heartbeat) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = undefined;
    }

    for (const unsub of this.#eventUnsubs) {
      unsub();
    }
    this.#eventUnsubs = [];

    this.#channel.stop();
  }

  kill(signal = 9): void {
    this.stop();
    this.#channel.kill(signal);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Conversion
  // ─────────────────────────────────────────────────────────────────────────

  toPlugin(status: PluginHealth): Plugin {
    const m = this.metadata;
    return {
      uid: this.uid,
      name: this.name,
      version: this.version,
      description: m.description ?? null,
      author: m.author ?? null,
      homepage: m.homepage ?? null,
      repository: m.repository ?? null,
      icon: m.icon ?? null,
      keywords: m.keywords ?? [],
      license: m.license ?? null,
      engines: m.engines,
      ref: this.ref,
      dir: this.dir,
      status,
      pid: this.pid,
      startedAt: this.startedAt,
      lastError: null,
      tools: m.tools ?? [],
      blocks: m.blocks ?? [],
      locales: this.locales,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  #setupHandlers(): void {
    this.#channel.on(hello, () => {
      this.callbacks.onReady(this);
    });

    this.#channel.on(ready, () => {
      // Plugin SDK ready signal - already handled by hello
    });

    this.#channel.on(log, ({ level, message, meta }) => {
      this.callbacks.onLog(level, message, meta);
    });

    this.#channel.on(registerTool, ({ tool }) => {
      const declared = this.metadata.tools?.find((t) => t.id === tool.id);
      if (!declared) return; // Undeclared tools ignored

      this.#tools.add(`${this.name}:${tool.id}`);
      this.callbacks.onTool({
        id: tool.id,
        description: tool.description ?? declared.description,
        icon: declared.icon ?? tool.icon,
        color: declared.color ?? tool.color,
        inputSchema: tool.inputSchema,
      });
    });

    this.#channel.on(registerBlock, ({ block }) => {
      const declared = this.metadata.blocks?.find((b) => b.id === block.id);
      if (!declared) return; // Undeclared blocks ignored

      this.#blocks.add(`${this.name}:${block.id}`);
      this.callbacks.onBlock(block);
    });

    this.#channel.on(emit, ({ eventType, payload }) => {
      this.callbacks.onEvent(eventType, payload);
    });

    this.#channel.on(subscribe, ({ patterns }) => {
      for (const pattern of patterns) {
        if (this.#subscriptions.has(pattern)) continue;
        this.#subscriptions.add(pattern);

        const unsub = this.callbacks.onSubscribe(patterns, (brikaEvent) => {
          if (!this.#stopped) {
            this.#channel.send(event, { event: brikaEvent });
          }
        });
        this.#eventUnsubs.push(unsub);
      }
    });
  }

  #startHeartbeat(): void {
    this.#heartbeat = setInterval(async () => {
      if (this.#stopped) {
        clearInterval(this.#heartbeat);
        return;
      }

      try {
        await this.#channel.ping(this.config.heartbeatTimeoutMs);
        this.#lastPong = now();
      } catch {
        const silentMs = now() - this.#lastPong;
        this.callbacks.onHeartbeatFailed(this, silentMs);
      }
    }, this.config.heartbeatIntervalMs);
  }
}
