import type { Json } from '@brika/ipc';
import type { BlockDefinition } from '@brika/sdk';
import type { BrikaEvent, LogLevel } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { GenericEventActions, PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
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

  emitPluginEvent(name: string, eventType: string, payload: Json): void {
    this.#logs.debug('plugin.event.emit', { plugin: name, type: eventType });
    this.#events.dispatch(
      GenericEventActions.emit.create(
        {
          type: eventType,
          source: name,
          payload,
        },
        name
      )
    );
  }

  subscribeToEvents(patterns: string[], handler: (event: BrikaEvent) => void): () => void {
    return this.#events.subscribeGlob(patterns, (action) => {
      handler({
        id: action.id,
        type: action.type,
        source: action.source ?? 'unknown',
        payload: action.payload as Json,
        ts: action.timestamp,
      });
    });
  }
}
