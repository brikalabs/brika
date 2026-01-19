import type { Json } from '@brika/ipc';
import type { BlockDefinition } from '@brika/sdk';
import type { BrikaEvent, LogLevel } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginActions, SparkActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { SparkRegistry } from '@/runtime/sparks';
import { StateStore } from '@/runtime/state/state-store';
import type { PluginProcess } from './plugin-process';
import { now } from './utils';

/**
 * Handles plugin event callbacks and dispatching.
 */
@singleton()
export class PluginEventHandler {
  readonly #logs = inject(Logger);
  readonly #events = inject(EventSystem);
  readonly #state = inject(StateStore);
  readonly #blocks = inject(BlockRegistry);
  readonly #sparks = inject(SparkRegistry);

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
    this.#logs.info('plugin.loaded', {
      name: process.name,
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
  }

  onPluginLog(name: string, level: string, message: string, meta?: Record<string, unknown>): void {
    this.#logs.emit({
      ts: now(),
      level: level as LogLevel,
      source: 'plugin',
      pluginName: name,
      message,
      meta: meta as Record<string, Json> | undefined,
    });
  }

  registerBlock(
    pluginName: string,
    block: { id: string; [key: string]: unknown },
    packageMetadata?: { blocks?: Array<{ id: string; [key: string]: unknown }> }
  ): void {
    // Merge runtime block definition with package.json metadata
    const pkgBlock = packageMetadata?.blocks?.find((b) => b.id === block.id);
    const merged = pkgBlock ? { ...pkgBlock, ...block } : block;

    this.#blocks.register(merged as unknown as BlockDefinition, pluginName);
    this.#logs.debug('plugin.block.registered', { plugin: pluginName, block: block.id });
  }

  registerSpark(pluginName: string, spark: { id: string; schema?: Record<string, unknown> }): void {
    this.#sparks.register(spark, pluginName);
    this.#logs.debug('plugin.spark.registered', { plugin: pluginName, spark: spark.id });
  }

  emitSpark(pluginName: string, sparkId: string, payload: Json): void {
    const fullType = `${pluginName}:${sparkId}`;

    // Verify spark is registered
    if (!this.#sparks.has(fullType)) {
      this.#logs.warn('spark.emit.unknown', { type: fullType, plugin: pluginName });
      return;
    }

    this.#logs.debug('spark.emit', { type: fullType, plugin: pluginName });
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
}
