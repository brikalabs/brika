import { inject, singleton } from '@brika/di';
import type { Json } from '@brika/ipc';
import type { BlockDefinition } from '@brika/sdk';
import { BlockRegistry } from '@/runtime/blocks';
import { BoardLoader } from '@/runtime/boards/board-loader';
import { BrickDataStore, BrickTypeRegistry } from '@/runtime/bricks';
import { BrickActions, PluginActions, SparkActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import type { LogLevel } from '@/runtime/logs/types';
import { SparkRegistry } from '@/runtime/sparks';
import { StateStore } from '@/runtime/state/state-store';
import type { PluginProcess } from './plugin-process';
import { PluginRouteRegistry } from './plugin-route-registry';
import { now } from './utils';

/**
 * Handles plugin event callbacks and dispatching.
 */
@singleton()
export class PluginEventHandler {
  readonly #logs = inject(Logger).withSource('plugin');
  readonly #events = inject(EventSystem);
  readonly #state = inject(StateStore);
  readonly #blocks = inject(BlockRegistry);
  readonly #sparks = inject(SparkRegistry);
  readonly #brickTypes = inject(BrickTypeRegistry);
  readonly #brickDataStore = inject(BrickDataStore);
  readonly #pluginRoutes = inject(PluginRouteRegistry);
  readonly #boardLoader = inject(BoardLoader);

  /** Block emit callback - set by PluginManager */
  #onBlockEmit: ((instanceId: string, port: string, data: Json) => void) | null = null;
  /** Block log callback - set by PluginManager */
  #onBlockLog:
    | ((instanceId: string, workflowId: string, level: string, message: string) => void)
    | null = null;

  setBlockEmitHandler(handler: (instanceId: string, port: string, data: Json) => void): void {
    this.#onBlockEmit = handler;
  }

  clearBlockEmitHandler(): void {
    this.#onBlockEmit = null;
  }

  setBlockLogHandler(
    handler: (instanceId: string, workflowId: string, level: string, message: string) => void
  ): void {
    this.#onBlockLog = handler;
  }

  clearBlockLogHandler(): void {
    this.#onBlockLog = null;
  }

  onBlockEmit(instanceId: string, port: string, data: Json): void {
    this.#onBlockEmit?.(instanceId, port, data);
  }

  onBlockLog(instanceId: string, workflowId: string, level: string, message: string): void {
    this.#onBlockLog?.(instanceId, workflowId, level, message);
  }

  onPluginReady(process: PluginProcess): void {
    this.#state.setHealth(process.name, 'running');
    this.#logs.info('Plugin loaded successfully', {
      pluginName: process.name,
      uid: process.uid,
      version: process.version,
      pid: process.pid,
    });
    this.#events.dispatch(
      PluginActions.loaded.create(
        {
          uid: process.uid,
          name: process.name,
          version: process.version,
          pid: process.pid,
        },
        'hub'
      )
    );

    // Send existing brick instance configs so the plugin can hydrate
    // per-instance state (e.g. start polling for a configured city).
    this.#sendInitialBrickConfigs(process);
  }

  /**
   * Deliver existing brick configs to a freshly-started plugin.
   * Without this, `onBrickConfigChange` only fires on explicit saves,
   * leaving bricks with per-instance config stuck in loading state.
   */
  #sendInitialBrickConfigs(process: PluginProcess): void {
    const prefix = `${process.name}:`;
    for (const board of this.#boardLoader.list()) {
      for (const brick of board.bricks) {
        if (brick.brickTypeId.startsWith(prefix) && Object.keys(brick.config).length > 0) {
          process.sendUpdateBrickConfig(brick.instanceId, brick.config);
        }
      }
    }
  }

  onPluginLog(name: string, level: LogLevel, message: string, meta?: Record<string, Json>): void {
    this.#logs.emit({
      ts: now(),
      level,
      source: 'plugin',
      pluginName: name,
      message,
      meta,
    });
  }

  registerBlock(
    pluginName: string,
    block: {
      id: string;
      [key: string]: unknown;
    },
    packageMetadata?: {
      version?: string;
      description?: string;
      author?:
        | string
        | {
            name?: string;
          };
      icon?: string;
      homepage?: string;
      blocks?: Array<{
        id: string;
        [key: string]: unknown;
      }>;
    }
  ): void {
    // Merge runtime block definition with package.json metadata
    const pkgBlock = packageMetadata?.blocks?.find((b) => b.id === block.id);
    const merged = pkgBlock
      ? {
          ...pkgBlock,
          ...block,
        }
      : block;

    this.#blocks.register(merged as unknown as BlockDefinition, {
      id: pluginName,
      version: packageMetadata?.version ?? 'unknown',
      name: pluginName,
      description: packageMetadata?.description,
      author:
        typeof packageMetadata?.author === 'string'
          ? packageMetadata.author
          : packageMetadata?.author?.name,
      icon: packageMetadata?.icon,
      homepage: packageMetadata?.homepage,
    });
    this.#logs.debug('Block registered from plugin', {
      pluginName: pluginName,
      blockId: block.id,
    });
  }

  registerSpark(
    pluginName: string,
    spark: {
      id: string;
      schema?: Record<string, unknown>;
    }
  ): void {
    this.#sparks.register(spark, pluginName);
    this.#logs.debug('Spark registered from plugin', {
      pluginName: pluginName,
      sparkId: spark.id,
    });
  }

  emitSpark(pluginName: string, sparkId: string, payload: Json): void {
    const fullType = `${pluginName}:${sparkId}`;

    // Verify spark is registered
    if (!this.#sparks.has(fullType)) {
      this.#logs.warn('Attempted to emit unknown spark', {
        sparkType: fullType,
        pluginName: pluginName,
      });
      return;
    }

    this.#logs.debug('Spark emitted from plugin', {
      sparkType: fullType,
      pluginName: pluginName,
    });
    this.#events.dispatch(
      SparkActions.emit.create(
        {
          type: fullType,
          source: pluginName,
          payload,
        },
        pluginName
      )
    );
  }

  subscribeToSparks(
    sparkType: string,
    handler: (event: {
      type: string;
      payload: Json;
      source: string;
      ts: number;
      id: string;
    }) => void
  ): () => void {
    return this.#events.subscribe(SparkActions.emit, (action) => {
      if (action.payload.type === sparkType) {
        handler({
          type: action.payload.type,
          payload: action.payload.payload as Json,
          source: action.payload.source,
          ts: action.timestamp,
          id: action.id,
        });
      }
    });
  }

  registerBrickType(
    pluginName: string,
    brickType: {
      id: string;
      families: Array<'sm' | 'md' | 'lg'>;
      config?: unknown[];
    },
    manifest?: {
      name?: string;
      description?: string;
      category?: string;
      icon?: string;
      color?: string;
      config?: unknown[];
    },
    pluginUid?: string
  ): void {
    const { fullId, isNew } = this.#brickTypes.register(brickType, pluginName, manifest, pluginUid);
    this.#logs.debug('Brick type registered from plugin', {
      pluginName,
      brickTypeId: brickType.id,
    });
    // Only dispatch event on first registration to avoid duplicate UI updates
    if (isNew) {
      this.#events.dispatch(
        BrickActions.typeRegistered.create(
          {
            pluginName,
            brickTypeId: fullId,
            descriptor: this.#brickTypes.get(fullId),
          },
          pluginName
        )
      );
    }
  }

  registerRoute(pluginName: string, method: string, path: string): void {
    this.#pluginRoutes.register(pluginName, method, path);
    this.#logs.debug('Route registered from plugin', {
      pluginName,
      method,
      path,
    });
  }

  onPluginDisconnected(pluginName: string): void {
    this.#brickDataStore.removeByPlugin(pluginName);
  }

  pushBrickData(pluginName: string, brickTypeId: string, data: unknown): void {
    const fullId = `${pluginName}:${brickTypeId}`;
    this.#brickDataStore.set(fullId, data);
    this.#events.dispatch(
      BrickActions.dataUpdated.create({ brickTypeId: fullId, data }, pluginName)
    );
  }
}
