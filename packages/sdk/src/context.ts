/**
 * Global Plugin Context
 *
 * Manages plugin lifecycle, blocks, and events via IPC.
 */

import { type Client, createClient, type Json } from '@brika/ipc';
import {
  blockEmit,
  brickInstanceAction as brickInstanceActionMsg,
  emitSpark as emitSparkMsg,
  log as logMsg,
  mountBrickInstance,
  ping,
  preferences as preferencesMsg,
  pushInput,
  registerBlock,
  registerBrickType as registerBrickTypeMsg,
  registerRoute as registerRouteMsg,
  registerSpark as registerSparkMsg,
  resizeBrickInstance,
  routeRequest as routeRequestMsg,
  type SparkEvent,
  sparkEvent as sparkEventMsg,
  startBlock,
  stopBlock,
  subscribeSpark as subscribeSparkMsg,
  uninstall as uninstallMsg,
  unmountBrickInstance,
  unsubscribeSpark as unsubscribeSparkMsg,
  updateBrickConfig,
  updatePreference as updatePreferenceMsg,
  patchBrickInstance as patchBrickInstanceMsg,
} from '@brika/ipc/contract';
import type { Serializable } from '@brika/serializable';
import type {
  BrickActionHandler,
  BrickInstanceContext,
  CompiledBrickType,
  ComponentNode,
  Mutation,
} from '@brika/ui-kit';
import type { BlockDefinition } from './blocks';
import type { BlockInstance, CompiledReactiveBlock } from './blocks/reactive-define';
import { _beginRender, _cleanupEffects, _createState, _endRender, type BrickState } from './brick-hooks';
import { reconcile } from './reconciler';
import type { AnyObj } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type InitHandler = () => void | Promise<void>;
type StopHandler = () => void | Promise<void>;
type UninstallHandler = () => void | Promise<void>;
type PreferencesChangeHandler = (preferences: Record<string, unknown>) => void;
interface RouteRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}
interface RouteResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Json;
}
type RouteHandler = (req: RouteRequest) => RouteResponse | Promise<RouteResponse>;

interface BlockDecl {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  color?: string;
}

interface SparkDecl {
  id: string;
  name: string;
  description?: string;
}

interface BrickDecl {
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
  blocks?: BlockDecl[];
  sparks?: SparkDecl[];
  bricks?: BrickDecl[];
}

interface BrickInstanceState {
  instanceId: string;
  brickTypeId: string;
  w: number;
  h: number;
  config: Record<string, unknown>;
  hookState: BrickState;
  /** What the hub currently has (last successfully sent body). */
  sentBody: ComponentNode[];
  /** Latest render output waiting to be sent (null if nothing pending). */
  pendingBody: ComponentNode[] | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

class Context {
  readonly #manifest: Manifest;
  readonly #client: Client;
  readonly #declaredBlocks: Set<string>;
  readonly #blockMeta: Map<string, BlockDecl>;
  readonly #blocks = new Set<string>();
  readonly #reactiveBlocks = new Map<string, CompiledReactiveBlock>();
  readonly #blockInstances = new Map<string, BlockInstance>();
  readonly #declaredSparks: Set<string>;
  readonly #sparks = new Set<string>();
  readonly #sparkSubscriptions = new Map<string, (event: SparkEvent) => void>();
  #sparkSubIdCounter = 0;
  readonly #declaredBricks: Set<string>;
  readonly #brickTypes = new Map<string, CompiledBrickType>();
  readonly #brickInstances = new Map<string, BrickInstanceState>();
  readonly #brickPatchTimers = new Map<string, Timer>();
  readonly #routeHandlers = new Map<string, RouteHandler>();
  readonly #initHandlers = new Set<InitHandler>();
  readonly #stopHandlers = new Set<StopHandler>();
  readonly #uninstallHandlers = new Set<UninstallHandler>();
  readonly #preferencesChangeHandlers = new Set<PreferencesChangeHandler>();
  #preferences: Record<string, unknown> = {};
  #started = false;
  #initialized = false;

  constructor() {
    this.#manifest = loadManifest();
    this.#client = createClient();
    this.#declaredBlocks = new Set(this.#manifest.blocks?.map((b) => b.id) ?? []);
    this.#blockMeta = new Map(this.#manifest.blocks?.map((b) => [b.id, b]));
    this.#declaredSparks = new Set(this.#manifest.sparks?.map((s) => s.id) ?? []);
    this.#declaredBricks = new Set(this.#manifest.bricks?.map((c) => c.id) ?? []);

    this.#setupIpc();
    process.nextTick(() => !this.#started && this.start());
  }

  start() {
    if (this.#started) return;
    this.#started = true;
    this.#client.start({ id: this.#manifest.name, version: this.#manifest.version });
    // Init handlers run after receiving config from hub
  }

  async #runInitHandlers() {
    if (this.#initialized) return;
    this.#initialized = true;
    for (const h of this.#initHandlers) {
      try {
        await h();
      } catch (e) {
        this.log('error', `Init handler error: ${e}`);
      }
    }
  }

  log(level: LogLevel, message: string, meta?: AnyObj) {
    this.#client.send(logMsg, { level, message, meta });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getPluginName(): string {
    return this.#manifest.name;
  }

  getPluginUid(): string | undefined {
    const uid = this.#preferences.__plugin_uid;
    return typeof uid === 'string' ? uid : undefined;
  }

  onInit(fn: InitHandler): () => void {
    // If already initialized, run immediately
    if (this.#initialized) {
      Promise.resolve(fn()).catch((e) => this.log('error', `Init handler error: ${e}`));
      return () => {
        /* no-op */
      };
    }
    this.#initHandlers.add(fn);
    return () => this.#initHandlers.delete(fn);
  }

  onStop(fn: StopHandler): () => void {
    this.#stopHandlers.add(fn);
    return () => this.#stopHandlers.delete(fn);
  }

  onUninstall(fn: UninstallHandler): () => void {
    this.#uninstallHandlers.add(fn);
    return () => this.#uninstallHandlers.delete(fn);
  }

  getPreferences<T extends Record<string, unknown> = Record<string, unknown>>(): T {
    return this.#preferences as T;
  }

  onPreferencesChange(handler: PreferencesChangeHandler): () => void {
    this.#preferencesChangeHandlers.add(handler);
    return () => this.#preferencesChangeHandlers.delete(handler);
  }

  registerSpark(spark: { id: string; schema?: Record<string, unknown> }): { id: string } {
    const { id } = spark;
    if (!this.#declaredSparks.has(id)) {
      throw new Error(
        `Spark "${id}" not in package.json. Add: "sparks": [{"id": "${id}", "name": "..."}]`
      );
    }
    if (this.#sparks.has(id)) throw new Error(`Spark "${id}" already registered`);

    this.#sparks.add(id);
    this.#client.send(registerSparkMsg, {
      spark: { id, schema: spark.schema as Record<string, Json> | undefined },
    });
    return { id };
  }

  emitSpark(sparkId: string, payload: Json): void {
    this.#client.send(emitSparkMsg, { sparkId, payload });
  }

  /**
   * Subscribe to a spark type and receive events.
   * Returns a cleanup function to unsubscribe.
   */
  subscribeSpark(sparkType: string, handler: (event: SparkEvent) => void): () => void {
    const subscriptionId = `spark-sub-${++this.#sparkSubIdCounter}`;
    this.#sparkSubscriptions.set(subscriptionId, handler);
    this.#client.send(subscribeSparkMsg, { sparkType, subscriptionId });

    return () => {
      this.#sparkSubscriptions.delete(subscriptionId);
      this.#client.send(unsubscribeSparkMsg, { subscriptionId });
    };
  }

  registerBlock(block: BlockDefinition & { start?: CompiledReactiveBlock['start'] }): {
    id: string;
  } {
    const { id } = block;
    if (!this.#declaredBlocks.has(id)) {
      throw new Error(
        `Block "${id}" not in package.json. Add: "blocks": [{"id": "${id}", "name": "...", "category": "..."}]`
      );
    }
    if (this.#blocks.has(id)) throw new Error(`Block "${id}" already registered`);

    const meta = this.#blockMeta.get(id);
    if (!meta) {
      throw new Error(`Block "${id}" metadata not found in package.json`);
    }

    this.#blocks.add(id);

    // Store the compiled reactive block if it has a start function
    if (block.start) {
      this.#reactiveBlocks.set(id, block as CompiledReactiveBlock);
    }

    // Merge runtime definition with package.json metadata
    this.#client.send(registerBlock, {
      block: {
        id,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        icon: meta.icon,
        color: meta.color,
        inputs: block.inputs.map((p) => ({
          id: p.id,
          name: p.id,
          typeName: p.typeName,
        })),
        outputs: block.outputs.map((p) => ({
          id: p.id,
          name: p.id,
          typeName: p.typeName,
        })),
        schema: block.schema as unknown as Record<string, Json>,
      },
    });
    return { id };
  }

  // ─── Routes ──────────────────────────────────────────────────────────────

  registerRoute(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, handler: RouteHandler): void {
    const routeId = `${method}:${path}`;
    this.#routeHandlers.set(routeId, handler);
    this.#client.send(registerRouteMsg, { method, path });
  }

  // ─── Preferences (write-back) ──────────────────────────────────────────

  updatePreference(key: string, value: unknown): void {
    this.#preferences[key] = value;
    this.#client.send(updatePreferenceMsg, { key, value });
  }

  // ─── Bricks ───────────────────────────────────────────────────────────────

  /**
   * Register a brick type with the hub.
   * No rendering happens yet — the hub will send mountBrickInstance when needed.
   */
  registerBrickType(brick: CompiledBrickType): void {
    const { id } = brick.spec;
    if (!this.#declaredBricks.has(id)) {
      throw new Error(
        `Brick "${id}" not in package.json. Add: "bricks": [{"id": "${id}"}]`
      );
    }
    if (this.#brickTypes.has(id)) throw new Error(`Brick type "${id}" already registered`);

    this.#brickTypes.set(id, brick);
    this.#client.send(registerBrickTypeMsg, {
      brickType: {
        id,
        families: brick.spec.families,
        minSize: brick.spec.minSize,
        maxSize: brick.spec.maxSize,
        config: brick.spec.config as unknown[] | undefined,
      },
    });
  }

  /**
   * Schedule a debounced patch send for a brick instance.
   * The actual diff is computed at send time against sentBody (what the hub has).
   */
  #debouncePatch(state: BrickInstanceState): void {
    const existing = this.#brickPatchTimers.get(state.instanceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.#brickPatchTimers.delete(state.instanceId);
      if (!state.pendingBody) return;

      const mutations = reconcile(state.sentBody, state.pendingBody);
      if (mutations.length > 0) {
        state.sentBody = state.pendingBody;
        this.#client.send(patchBrickInstanceMsg, {
          instanceId: state.instanceId,
          mutations: mutations as unknown[],
        });
      }
      state.pendingBody = null;
    }, 50);
    this.#brickPatchTimers.set(state.instanceId, timer);
  }

  #renderInstance(state: BrickInstanceState, immediate = false): void {
    const brickType = this.#brickTypes.get(state.brickTypeId);
    if (!brickType) return;

    state.hookState.brickSize = { width: state.w, height: state.h };
    state.hookState.config = state.config;
    state.hookState.configKeys ??= new Set(brickType.spec.config?.map((c) => c.name));
    _beginRender(state.hookState);
    try {
      const ctx: BrickInstanceContext = {
        instanceId: state.instanceId,
        config: state.config,
      };
      const result = brickType.component(ctx);
      const body: ComponentNode[] = Array.isArray(result) ? result : [result];

      if (immediate) {
        // Initial render — diff and send immediately (no debounce)
        const mutations = reconcile(state.sentBody, body);
        if (mutations.length > 0) {
          state.sentBody = body;
          state.pendingBody = null;
          this.#brickPatchTimers.delete(state.instanceId);
          this.#client.send(patchBrickInstanceMsg, {
            instanceId: state.instanceId,
            mutations: mutations as unknown[],
          });
        }
      } else {
        // Subsequent renders — store latest body and debounce the send.
        // The diff is computed at send time against sentBody (what the hub has).
        state.pendingBody = body;
        this.#debouncePatch(state);
      }
    } catch (err) {
      console.error(`[brick:${state.brickTypeId}] Render error in instance ${state.instanceId}:`, err);
    } finally {
      _endRender();
    }
  }

  #mountInstance(instanceId: string, brickTypeId: string, w: number, h: number, config: Record<string, unknown>): void {
    if (this.#brickInstances.has(instanceId)) return;

    const brickType = this.#brickTypes.get(brickTypeId);
    if (!brickType) return;

    const state: BrickInstanceState = {
      instanceId,
      brickTypeId,
      w,
      h,
      config,
      hookState: _createState(() => this.#renderInstance(state)),
      sentBody: [],
      pendingBody: null,
    };

    this.#brickInstances.set(instanceId, state);

    // Initial render — send immediately (no debounce) so body is available ASAP
    this.#renderInstance(state, true);
  }

  #unmountInstance(instanceId: string): void {
    const state = this.#brickInstances.get(instanceId);
    if (!state) return;

    _cleanupEffects(state.hookState);

    const timer = this.#brickPatchTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      this.#brickPatchTimers.delete(instanceId);
    }

    this.#brickInstances.delete(instanceId);
  }

  #setupIpc() {
    this.#client.implement(ping, ({ ts }) => ({ ts }));

    this.#client.on(preferencesMsg, ({ values }) => {
      const isFirstTime = Object.keys(this.#preferences).length === 0;
      this.#preferences = values;

      if (isFirstTime) {
        // Run init handlers after receiving first preferences
        this.#runInitHandlers();
      } else {
        // Notify change handlers on subsequent updates
        for (const handler of this.#preferencesChangeHandlers) {
          handler(this.#preferences);
        }
      }
    });

    // ─── Reactive Block Lifecycle ───
    this.#client.implement(startBlock, ({ blockType, instanceId, workflowId, config }) => {
      // Extract local block ID from full type (pluginId:blockId)
      const colonIndex = blockType.indexOf(':');
      const localBlockId = colonIndex >= 0 ? blockType.slice(colonIndex + 1) : blockType;
      const block = this.#reactiveBlocks.get(localBlockId);

      if (!block) {
        return { ok: false, error: `Block not found: ${localBlockId}` };
      }

      if (this.#blockInstances.has(instanceId)) {
        return { ok: false, error: `Block instance already exists: ${instanceId}` };
      }

      try {
        const instance = block.start({
          blockId: instanceId,
          workflowId,
          config,
          emit: (port, data) => {
            this.#client.send(blockEmit, { instanceId, port, data: data as Json });
          },
        });

        this.#blockInstances.set(instanceId, instance);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });

    this.#client.on(pushInput, ({ instanceId, port, data }) => {
      const instance = this.#blockInstances.get(instanceId);
      if (instance) {
        instance.pushInput(port, data as Serializable);
      }
    });

    this.#client.on(stopBlock, ({ instanceId }) => {
      const instance = this.#blockInstances.get(instanceId);
      if (instance) {
        instance.stop();
        this.#blockInstances.delete(instanceId);
      }
    });

    // ─── Spark Events ───
    this.#client.on(sparkEventMsg, ({ subscriptionId, event }) => {
      const handler = this.#sparkSubscriptions.get(subscriptionId);
      if (handler) {
        handler(event);
      }
    });

    // ─── Brick Instance Lifecycle ───
    this.#client.on(mountBrickInstance, ({ instanceId, brickTypeId, w, h, config }) => {
      // Extract local type ID from full type (pluginName:brickId)
      const colonIndex = brickTypeId.indexOf(':');
      const localId = colonIndex >= 0 ? brickTypeId.slice(colonIndex + 1) : brickTypeId;
      this.#mountInstance(instanceId, localId, w, h, config as Record<string, unknown>);
    });

    this.#client.on(resizeBrickInstance, ({ instanceId, w, h }) => {
      const state = this.#brickInstances.get(instanceId);
      if (!state) return;
      state.w = w;
      state.h = h;
      this.#renderInstance(state);
    });

    this.#client.on(updateBrickConfig, ({ instanceId, config }) => {
      const state = this.#brickInstances.get(instanceId);
      if (!state) return;
      state.config = config as Record<string, unknown>;
      state.hookState.config = state.config;
      this.#renderInstance(state);
    });

    this.#client.on(unmountBrickInstance, ({ instanceId }) => {
      this.#unmountInstance(instanceId);
    });

    this.#client.on(brickInstanceActionMsg, ({ instanceId, actionId, payload }) => {
      const state = this.#brickInstances.get(instanceId);
      if (!state) return;

      const ref = state.hookState.actionRefs.get(actionId);
      if (ref) {
        ref.current(payload as Record<string, unknown> | undefined);
        this.#renderInstance(state);
      }
    });

    // ─── Plugin Routes ───
    this.#client.implement(routeRequestMsg, async ({ routeId, method, path, query, headers, body }) => {
      const handler = this.#routeHandlers.get(routeId);
      if (!handler) {
        return { status: 404, body: { error: 'Route handler not found' } };
      }
      try {
        return await handler({ method, path, query, headers, body });
      } catch (e) {
        return { status: 500, body: { error: String(e) } };
      }
    });

    // Handle uninstall - runs before stop for cleanup specific to uninstall
    this.#client.on(uninstallMsg, async () => {
      for (const h of this.#uninstallHandlers) {
        try {
          await h();
        } catch (e) {
          this.log('error', `Uninstall handler error: ${e}`);
        }
      }
    });

    this.#client.onStop(async () => {
      // Stop all running block instances
      for (const instance of this.#blockInstances.values()) {
        instance.stop();
      }
      this.#blockInstances.clear();

      // Unmount all brick instances
      for (const instanceId of [...this.#brickInstances.keys()]) {
        this.#unmountInstance(instanceId);
      }

      for (const h of this.#stopHandlers) await h();
    });
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

export type { StopHandler };
