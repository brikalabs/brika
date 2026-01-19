/**
 * Global Plugin Context
 *
 * Manages plugin lifecycle, blocks, and events via IPC.
 */

import { type Client, createClient, type Json } from '@brika/ipc';
import {
  blockEmit,
  emitSpark as emitSparkMsg,
  log as logMsg,
  ping,
  preferences as preferencesMsg,
  pushInput,
  registerBlock,
  registerSpark as registerSparkMsg,
  type SparkEvent,
  sparkEvent as sparkEventMsg,
  startBlock,
  stopBlock,
  subscribeSpark as subscribeSparkMsg,
  uninstall as uninstallMsg,
  unsubscribeSpark as unsubscribeSparkMsg,
} from '@brika/ipc/contract';
import type { Serializable } from '@brika/serializable';
import type { BlockDefinition } from './blocks';
import type { BlockInstance, CompiledReactiveBlock } from './blocks/reactive-define';
import type { AnyObj } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type InitHandler = () => void | Promise<void>;
type StopHandler = () => void | Promise<void>;
type UninstallHandler = () => void | Promise<void>;
type PreferencesChangeHandler = (preferences: Record<string, unknown>) => void;

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

interface Manifest {
  name: string;
  version: string;
  blocks?: BlockDecl[];
  sparks?: SparkDecl[];
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
