import { type Json, type PluginChannel, RpcError } from '@brika/ipc';
import {
  blockEmit,
  blockLog,
  brickInstanceAction,
  callAction,
  emitSpark,
  getHubLocation,
  getHubTimezone,
  hello,
  log,
  preferenceOptions,
  preferences,
  pushBrickData,
  pushInput,
  type RouteResponseType,
  ready,
  registerAction,
  registerBlock,
  registerBrickType,
  registerRoute,
  registerSpark,
  routeRequest,
  type SparkEvent as SparkEventType,
  setTimezone,
  sparkEvent,
  startBlock,
  stopBlock,
  subscribeSpark,
  unsubscribeSpark,
  updateBrickConfig,
  updatePreference,
} from '@brika/ipc/contract';
import type { Permission } from '@brika/permissions';
import type { BrickFamily, Plugin, PluginHealth } from '@brika/plugin';
import type { PluginPackageSchema } from '@brika/schema';
import { getProcessMetrics } from '@/runtime/metrics';
import type { HubLocation } from '@/runtime/state/state-store';
import { now } from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginProcessConfig {
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export interface SparkRegistration {
  id: string;
  schema?: Record<string, unknown>;
}

export interface PluginProcessCallbacks {
  onReady: (process: PluginProcess) => void;
  onLog: (level: string, message: string, meta?: Record<string, Json>) => void;
  onBlock: (block: BlockRegistration) => void;
  onBlockEmit: (instanceId: string, port: string, data: Json) => void;
  onBlockLog: (instanceId: string, workflowId: string, level: string, message: string) => void;
  onSpark: (spark: SparkRegistration) => void;
  onSparkEmit: (sparkId: string, payload: Json) => void;
  onSparkSubscribe: (
    sparkType: string,
    subscriptionId: string,
    process: PluginProcess
  ) => () => void;
  onSparkUnsubscribe: (subscriptionId: string) => void;
  onBrickType: (brickType: BrickTypeRegistration) => void;
  onBrickDataPush: (brickTypeId: string, data: unknown) => void;
  onRoute: (method: string, path: string) => void;
  onUpdatePreference: (key: string, value: unknown) => void;
  onGetHubLocation: () => HubLocation | null;
  onGetHubTimezone: () => string | null;
  onGetGrantedPermissions: (name: string) => string[];
  onHeartbeatFailed: (process: PluginProcess, silentMs: number) => void;
  onDisconnect: (process: PluginProcess, error?: Error) => void;
  onMetrics?: (process: PluginProcess, cpu: number, memory: number) => void;
}

export interface BlockRegistration {
  id: string;
  [key: string]: unknown;
}

export interface BrickTypeRegistration {
  id: string;
  families: BrickFamily[];
  minSize?: {
    w: number;
    h: number;
  };
  maxSize?: {
    w: number;
    h: number;
  };
  config?: unknown[];
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
  readonly #sparks = new Set<string>();
  readonly #brickTypes = new Set<string>();
  readonly #actions = new Set<string>();
  readonly #sparkSubscriptions = new Map<string, () => void>(); // subscriptionId -> unsubscribe
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

  get sparks(): ReadonlySet<string> {
    return this.#sparks;
  }

  get brickTypes(): ReadonlySet<string> {
    return this.#brickTypes;
  }

  get actions(): ReadonlySet<string> {
    return this.#actions;
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
  ): Promise<{
    ok: boolean;
    error?: string;
  }> {
    if (this.#stopped) {
      return {
        ok: false,
        error: 'Plugin stopped',
      };
    }
    try {
      return await this.#channel.call(startBlock, {
        blockType,
        instanceId,
        workflowId,
        config,
      });
    } catch (e) {
      return {
        ok: false,
        error: String(e),
      };
    }
  }

  pushInput(instanceId: string, port: string, data: Json): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(pushInput, {
      instanceId,
      port,
      data,
    });
  }

  stopBlockInstance(instanceId: string): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(stopBlock, {
      instanceId,
    });
  }

  /**
   * Send preferences to the plugin
   */
  sendPreferences(values: Record<string, unknown>): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(preferences, {
      values: {
        ...values,
        __plugin_uid: this.uid,
      },
    });
  }

  /**
   * Send a spark event to the plugin for a specific subscription
   */
  sendSparkEvent(subscriptionId: string, event: SparkEventType): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(sparkEvent, {
      subscriptionId,
      event,
    });
  }

  /**
   * Push updated config to a running brick instance (no remount)
   */
  sendUpdateBrickConfig(instanceId: string, config: Record<string, unknown>): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(updateBrickConfig, {
      instanceId,
      config,
    });
  }

  /**
   * Send a brick action to a specific instance on the plugin
   */
  sendBrickInstanceAction(
    instanceId: string,
    brickTypeId: string,
    actionId: string,
    payload?: Json
  ): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(brickInstanceAction, {
      instanceId,
      brickTypeId,
      actionId,
      payload,
    });
  }

  sendTimezone(timezone: string | null): void {
    if (this.#stopped) {
      return;
    }
    this.#channel.send(setTimezone, { timezone });
  }

  /**
   * Forward an HTTP request to the plugin and return its response.
   * Returns 503 if the plugin is stopped, 502 if the RPC fails.
   */
  async sendRouteRequest(
    routeId: string,
    method: string,
    path: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    body?: Json
  ): Promise<RouteResponseType> {
    if (this.#stopped) {
      return {
        status: 503,
      };
    }
    try {
      return await this.#channel.call(routeRequest, {
        routeId,
        method,
        path,
        query,
        headers,
        body,
      });
    } catch (e) {
      this.callbacks.onLog('error', `Route handler failed [${method} ${path}]: ${e}`);
      return {
        status: 502,
        body: {
          error: 'Plugin route handler failed',
        },
      };
    }
  }

  /**
   * Fetch dynamic options for a preference from the plugin via IPC.
   * Returns empty array if the plugin is stopped or the RPC fails.
   */
  async fetchPreferenceOptions(name: string): Promise<
    Array<{
      value: string;
      label: string;
    }>
  > {
    if (this.#stopped) {
      return [];
    }
    try {
      const result = await this.#channel.call(preferenceOptions, {
        name,
      });
      return result.options;
    } catch (e) {
      this.callbacks.onLog('warn', `Failed to fetch preference options for "${name}": ${e}`);
      return [];
    }
  }

  /**
   * Call a plugin-defined action via IPC.
   * Returns `{ ok, data?, error? }`.
   */
  async callPluginAction(
    actionId: string,
    input?: Json
  ): Promise<{
    ok: boolean;
    data?: Json;
    error?: string;
  }> {
    if (this.#stopped) {
      return {
        ok: false,
        error: 'Plugin stopped',
      };
    }
    try {
      return await this.#channel.call(
        callAction,
        {
          actionId,
          input,
        },
        0
      );
    } catch (e) {
      this.callbacks.onLog('error', `Action call failed [${actionId}]: ${e}`);
      return {
        ok: false,
        error: 'Action call failed',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  stop(): void {
    if (this.#stopped) {
      return;
    }
    this.#stopped = true;

    if (this.#heartbeat) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = undefined;
    }

    // Clean up all spark subscriptions
    for (const unsubscribe of this.#sparkSubscriptions.values()) {
      unsubscribe();
    }
    this.#sparkSubscriptions.clear();

    this.#channel.stop();
  }

  /** Promise that resolves when the underlying process exits. */
  get exited(): Promise<number> {
    return this.#channel.exited;
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
      displayName: m.displayName ?? null,
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
      sparks: m.sparks ?? [],
      bricks: m.bricks ?? [],
      pages: m.pages ?? [],
      permissions: m.permissions ?? [],
      grantedPermissions: this.callbacks.onGetGrantedPermissions(this.name),
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
      if (!declared) {
        return; // Undeclared blocks ignored
      }

      this.#blocks.add(`${this.name}:${block.id}`);
      this.callbacks.onBlock(block);
    });

    this.#channel.on(registerSpark, ({ spark }) => {
      const declared = this.metadata.sparks?.find((s) => s.id === spark.id);
      if (!declared) {
        return; // Undeclared sparks ignored
      }

      this.#sparks.add(`${this.name}:${spark.id}`);
      this.callbacks.onSpark(spark);
    });

    this.#channel.on(emitSpark, ({ sparkId, payload }) => {
      this.callbacks.onSparkEmit(sparkId, payload);
    });

    this.#channel.on(subscribeSpark, ({ sparkType, subscriptionId }) => {
      const unsubscribe = this.callbacks.onSparkSubscribe(sparkType, subscriptionId, this);
      this.#sparkSubscriptions.set(subscriptionId, unsubscribe);
    });

    this.#channel.on(unsubscribeSpark, ({ subscriptionId }) => {
      const unsubscribe = this.#sparkSubscriptions.get(subscriptionId);
      if (unsubscribe) {
        unsubscribe();
        this.#sparkSubscriptions.delete(subscriptionId);
      }
      this.callbacks.onSparkUnsubscribe(subscriptionId);
    });

    this.#channel.on(blockEmit, ({ instanceId, port, data }) => {
      this.callbacks.onBlockEmit(instanceId, port, data);
    });

    this.#channel.on(blockLog, ({ instanceId, workflowId, level, message }) => {
      this.callbacks.onBlockLog(instanceId, workflowId, level, message);
    });

    this.#channel.on(registerBrickType, ({ brickType }) => {
      const declared = this.metadata.bricks?.find((c) => c.id === brickType.id);
      if (!declared) {
        return; // Undeclared brick types ignored
      }

      this.#brickTypes.add(`${this.name}:${brickType.id}`);
      this.callbacks.onBrickType(brickType);
    });

    this.#channel.on(pushBrickData, ({ brickTypeId, data }) => {
      this.callbacks.onBrickDataPush(brickTypeId, data);
    });

    this.#channel.on(registerAction, ({ id }) => {
      this.#actions.add(id);
    });

    this.#channel.on(registerRoute, ({ method, path }) => {
      this.callbacks.onRoute(method, path);
    });

    this.#channel.on(updatePreference, ({ key, value }) => {
      this.callbacks.onUpdatePreference(key, value);
    });

    this.#channel.implement(getHubLocation, () => {
      this.#requirePermission('location');
      return {
        location: this.callbacks.onGetHubLocation(),
      };
    });

    this.#channel.implement(getHubTimezone, () => {
      return {
        timezone: this.callbacks.onGetHubTimezone(),
      };
    });
  }

  #requirePermission(permission: Permission): void {
    const granted = this.callbacks.onGetGrantedPermissions(this.name);
    if (!granted.includes(permission)) {
      throw new RpcError('PERMISSION_DENIED', `Permission "${permission}" is not granted`, {
        permission,
      });
    }
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
