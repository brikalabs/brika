/**
 * Workflow Executor
 *
 * Executes workflows with port-based routing and IPC block execution.
 */

import type { BlockConnection, BlockContext, Json, Workflow, WorkflowBlock } from '@elia/sdk';
import type { BlockRegistry } from '@/runtime/blocks';
import type { EventSystem } from '@/runtime/events/event-system';
import type { LogRouter } from '@/runtime/logs/log-router';
import type { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { ToolRegistry } from '@/runtime/tools/tool-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutorDeps {
  plugins: PluginManager;
  tools: ToolRegistry;
  events: EventSystem;
  logs: LogRouter;
  blocks: BlockRegistry;
}

export interface TriggerData {
  type: string;
  payload: Json;
  source: string;
}

export interface ExecutionEvent {
  type: 'block.start' | 'block.complete' | 'block.error' | 'workflow.complete' | 'workflow.error';
  blockId?: string;
  output?: string;
  data?: Json;
  error?: string;
}

export type ExecutionListener = (event: ExecutionEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Executor
// ─────────────────────────────────────────────────────────────────────────────

export class WorkflowExecutor {
  readonly #deps: ExecutorDeps;
  readonly #vars = new Map<string, Json>();
  readonly #blockOutputs = new Map<string, Record<string, Json>>();
  #listener?: ExecutionListener;

  constructor(deps: ExecutorDeps) {
    this.#deps = deps;
  }

  /**
   * Set a listener for execution events
   */
  onEvent(listener: ExecutionListener): void {
    this.#listener = listener;
  }

  /**
   * Execute a workflow
   */
  async run(workflow: Workflow, trigger: TriggerData): Promise<void> {
    this.#vars.clear();
    this.#blockOutputs.clear();

    // Build connection map: blockId.portId -> target connections
    const connections = this.#buildConnectionMap(workflow);

    // Find starting blocks (no incoming connections)
    const startBlocks = this.#findStartBlocks(workflow);

    if (startBlocks.length === 0) {
      this.#emit({ type: 'workflow.error', error: 'No start blocks found' });
      return;
    }

    // Execute starting blocks in parallel
    await Promise.all(
      startBlocks.map((block) => this.#executeBlock(block, workflow, trigger, connections, null))
    );

    this.#emit({ type: 'workflow.complete' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  #buildConnectionMap(workflow: Workflow): Map<string, BlockConnection[]> {
    const map = new Map<string, BlockConnection[]>();

    for (const conn of workflow.connections) {
      const key = `${conn.from}.${conn.fromPort || 'out'}`;
      const existing = map.get(key) || [];
      existing.push(conn);
      map.set(key, existing);
    }

    return map;
  }

  #findStartBlocks(workflow: Workflow): WorkflowBlock[] {
    // Blocks with no incoming connections
    const hasIncoming = new Set<string>();
    for (const conn of workflow.connections) {
      hasIncoming.add(conn.to);
    }

    return workflow.blocks.filter((b) => !hasIncoming.has(b.id));
  }

  async #executeBlock(
    block: WorkflowBlock,
    workflow: Workflow,
    trigger: TriggerData,
    connections: Map<string, BlockConnection[]>,
    inputData: Json
  ): Promise<void> {
    this.#emit({ type: 'block.start', blockId: block.id });

    // Build context
    const ctx: BlockContext = {
      trigger: {
        type: trigger.type,
        payload: trigger.payload,
        source: trigger.source,
        ts: Date.now(),
      },
      vars: Object.fromEntries(this.#vars),
      input: inputData,
      inputs: {}, // TODO: Support multi-input blocks
    };

    try {
      // Resolve block type (supports short names like "log" -> "blocks-builtin:log")
      const resolvedType = this.#resolveBlockType(block.type);

      // Execute block via plugin IPC
      const result = await this.#deps.plugins.executeBlock(resolvedType, block.config, ctx);

      if (result.error) {
        this.#emit({ type: 'block.error', blockId: block.id, error: result.error });
        return;
      }

      if (result.stop) {
        this.#emit({ type: 'block.complete', blockId: block.id, data: result.data });
        return;
      }

      // Store output
      const outputPort = result.output || 'out';
      this.#blockOutputs.set(block.id, { [outputPort]: result.data ?? null });

      this.#emit({
        type: 'block.complete',
        blockId: block.id,
        output: outputPort,
        data: result.data,
      });

      // Find downstream connections
      const key = `${block.id}.${outputPort}`;
      const downstream = connections.get(key) || [];

      // Execute downstream blocks
      await Promise.all(
        downstream.map((conn) => {
          const nextBlock = workflow.blocks.find((b) => b.id === conn.to);
          if (nextBlock) {
            return this.#executeBlock(
              nextBlock,
              workflow,
              trigger,
              connections,
              result.data ?? null
            );
          }
          return Promise.resolve();
        })
      );
    } catch (error) {
      this.#emit({ type: 'block.error', blockId: block.id, error: String(error) });
    }
  }

  #emit(event: ExecutionEvent): void {
    this.#listener?.(event);
  }

  /**
   * Resolve a block type - supports short names and full qualified names
   *
   * Examples:
   * - "log" -> "blocks-builtin:log" (if blocks-builtin:log exists)
   * - "blocks-builtin:log" -> "blocks-builtin:log" (already full qualified)
   * - "timer:custom" -> "timer:custom" (third-party block)
   */
  #resolveBlockType(type: string): string {
    // Already full qualified (contains :)
    if (type.includes(':')) {
      return type;
    }

    // Try to find by short name - search all registered blocks
    const allBlocks = this.#deps.blocks.list();

    // Look for exact match on the block ID part (after :)
    const match = allBlocks.find((b) => b.type?.endsWith(`:${type}`));
    if (match?.type) {
      return match.type;
    }

    // No match found - return as-is (will fail at execution with clear error)
    return type;
  }
}
