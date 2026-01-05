import type { Json } from '@brika/ipc';
import type { BlockDefinition } from '@brika/sdk';
import type { BrikaEvent, LogLevel, ToolInputSchema } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { GenericEventActions, PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { LogRouter } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';
import { ToolRegistry } from '@/runtime/tools/tool-registry';
import type { PluginProcess } from './plugin-process';
import { now } from './utils';

/**
 * Handles plugin event callbacks and dispatching.
 */
@singleton()
export class PluginEventHandler {
  readonly #logs = inject(LogRouter);
  readonly #events = inject(EventSystem);
  readonly #state = inject(StateStore);
  readonly #tools = inject(ToolRegistry);
  readonly #blocks = inject(BlockRegistry);

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

  registerTool(
    name: string,
    pluginName: string,
    tool: { id: string; description?: string; icon?: string; color?: string; inputSchema?: unknown }
  ): void {
    this.#tools.register(tool.id, pluginName, {
      description: tool.description,
      icon: tool.icon,
      color: tool.color,
      inputSchema: tool.inputSchema as ToolInputSchema | undefined,
    });
    this.#logs.debug('plugin.tool.registered', { plugin: name, tool: tool.id });
  }

  registerBlock(pluginName: string, block: { id: string; [key: string]: unknown }): void {
    this.#blocks.register(block as unknown as BlockDefinition, pluginName);
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
