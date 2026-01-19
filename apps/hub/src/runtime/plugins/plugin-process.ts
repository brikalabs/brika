import type { Json, PluginChannel } from '@brika/ipc';
import { getProcessMetrics } from '@/runtime/metrics';
import {
  blockEmit,
  blockLog,
  emit,
  event,
  hello,
  log,
  preferences,
  pushInput,
  ready,
  registerBlock,
  startBlock,
  stopBlock,
  subscribe,
} from '@brika/ipc/contract';
import type { PluginPackageSchema } from '@brika/schema';
import type { BrikaEvent, Plugin, PluginHealth } from '@brika/shared';
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
  onBlock: (block: BlockRegistration) => void;
  onBlockEmit: (instanceId: string, port: string, data: Json) => void;
  onBlockLog: (instanceId: string, workflowId: string, level: string, message: string) => void;
  onEvent: (eventType: string, payload: Json) => void;
  onSubscribe: (patterns: string[], handler: (event: BrikaEvent) => void) => () => void;
  onHeartbeatFailed: (process: PluginProcess, silentMs: number) => void;
  onDisconnect: (process: PluginProcess, error?: Error) => void;
  onMetrics?: (process: PluginProcess, cpu: number, memory: number) => void;
}

export interface BlockRegistration {
  id: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// PluginProcess - Manages a single running plugin
// ─────────────────────────────────────────────────────────────────────────────

export class PluginProcess {
  readonly name: string;
  readonly rootDirectory: string;
  readonly entryPoint: string;
  readonly uid: string;
  readonly version: string;
  readonly metadata: PluginPackageSchema;
  readonly locales: string[];
  readonly startedAt: number;

  readonly #channel: PluginChannel;
  #lastPong: number;
  #heartbeat?: Timer;
  readonly #blocks = new Set<string>();
  readonly #subscriptions = new Set<string>();
  #eventUnsubs: Array<() => void> = [];
  #stopped = false;

  constructor(
    channel: PluginChannel,
    info: {
      name: string;
      rootDirectory: string;
      entryPoint: string;
      uid: string;
      version: string;
      metadata: PluginPackageSchema;
      locales: string[];
    },
    private readonly config: PluginProcessConfig,
    private readonly callbacks: PluginProcessCallbacks
  ) {
    this.#channel = channel;
    this.#lastPong = now();
    this.startedAt = now();

    this.name = info.name;
    this.rootDirectory = info.rootDirectory;
    this.entryPoint = info.entryPoint;
    this.uid = info.uid;
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

  get blocks(): ReadonlySet<string> {
    return this.#blocks;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC Operations
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive Block Operations
  // ─────────────────────────────────────────────────────────────────────────

  async startBlock(
    blockType: string,
    instanceId: string,
    workflowId: string,
    config: Record<string, Json>
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.#stopped) return { ok: false, error: 'Plugin stopped' };
    try {
      return await this.#channel.call(startBlock, { blockType, instanceId, workflowId, config });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  pushInput(instanceId: string, port: string, data: Json): void {
    if (this.#stopped) return;
    this.#channel.send(pushInput, { instanceId, port, data });
  }

  stopBlockInstance(instanceId: string): void {
    if (this.#stopped) return;
    this.#channel.send(stopBlock, { instanceId });
  }

  /**
   * Send preferences to the plugin
   */
  sendPreferences(values: Record<string, unknown>): void {
    if (this.#stopped) return;
    this.#channel.send(preferences, { values });
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
      rootDirectory: this.rootDirectory,
      entryPoint: this.entryPoint,
      status,
      pid: this.pid,
      startedAt: this.startedAt,
      lastError: null,
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

    this.#channel.on(registerBlock, ({ block }) => {
      const declared = this.metadata.blocks?.find((b) => b.id === block.id);
      if (!declared) return; // Undeclared blocks ignored

      this.#blocks.add(`${this.name}:${block.id}`);
      this.callbacks.onBlock(block);
    });

    this.#channel.on(emit, ({ eventType, payload }) => {
      this.callbacks.onEvent(eventType, payload);
    });

    this.#channel.on(blockEmit, ({ instanceId, port, data }) => {
      this.callbacks.onBlockEmit(instanceId, port, data);
    });

    this.#channel.on(blockLog, ({ instanceId, workflowId, level, message }) => {
      this.callbacks.onBlockLog(instanceId, workflowId, level, message);
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

        // Collect metrics on successful heartbeat
        if (this.callbacks.onMetrics) {
          const metrics = await getProcessMetrics(this.pid);
          if (metrics) {
            this.callbacks.onMetrics(this, metrics.cpu, metrics.memory);
          }
        }
      } catch {
        const silentMs = now() - this.#lastPong;
        this.callbacks.onHeartbeatFailed(this, silentMs);
      }
    }, this.config.heartbeatIntervalMs);
  }
}
