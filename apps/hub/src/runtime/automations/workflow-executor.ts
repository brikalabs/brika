/**
 * Workflow Executor
 *
 * Reactive, event-driven workflow runtime.
 * Starts a workflow and runs it indefinitely until stopped.
 * Data flows through blocks via port connections.
 */

import type { Json } from '@brika/shared';
import type { BlockRegistry } from '@/runtime/blocks';
import type { Logger } from '@/runtime/logs/log-router';
import type { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import type { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { BlockConnection, Workflow, WorkflowBlock } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutorDeps {
  plugins: PluginManager;
  logs: Logger;
  blocks: BlockRegistry;
  events: PluginEventHandler;
}

/** Events emitted during workflow execution */
export interface ExecutionEvent {
  type: 'workflow.started' | 'workflow.stopped' | 'block.emit' | 'block.log' | 'block.error';
  workflowId: string;
  blockId?: string;
  port?: string;
  data?: Json;
  error?: string;
  level?: string;
  message?: string;
}

export type ExecutionListener = (event: ExecutionEvent) => void;

/** Port buffer - stores last value for inspection/debugging */
export interface PortBuffer {
  blockId: string;
  port: string;
  value: Json;
  ts: number;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor
// ─────────────────────────────────────────────────────────────────────────────

export class WorkflowExecutor {
  readonly #deps: ExecutorDeps;
  readonly #listeners = new Set<ExecutionListener>();

  // Active workflow state
  #workflow: Workflow | null = null;
  #instanceIds = new Set<string>(); // Block instance IDs
  #connections = new Map<string, BlockConnection[]>(); // "blockId.port" -> targets
  #buffers = new Map<string, PortBuffer>(); // "blockId:port" -> last value

  constructor(deps: ExecutorDeps) {
    this.#deps = deps;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start a workflow - instantiates all blocks and sets up routing.
   * The workflow runs indefinitely until stop() is called.
   */
  async start(workflow: Workflow): Promise<void> {
    // Stop any existing workflow
    if (this.#workflow) {
      this.stop();
    }

    this.#workflow = workflow;
    this.#connections = this.#buildConnectionMap(workflow);
    this.#buffers.clear();

    // Set up the block emit handler
    this.#deps.plugins.setBlockEmitHandler((instanceId, port, data) => {
      this.#onBlockEmit(instanceId, port, data);
    });

    // Set up the block log handler
    this.#deps.plugins.setBlockLogHandler((instanceId, workflowId, level, message) => {
      this.#onBlockLog(instanceId, workflowId, level, message);
    });

    // Start all blocks
    for (const block of workflow.blocks) {
      await this.#startBlock(block, workflow);
    }

    this.#emit({
      type: 'workflow.started',
      workflowId: workflow.id,
    });

    this.#deps.logs.info('workflow.started', {
      id: workflow.id,
      blocks: workflow.blocks.length,
    });
  }

  /**
   * Stop the running workflow - cleans up all blocks.
   */
  stop(): void {
    if (!this.#workflow) return;

    const workflowId = this.#workflow.id;

    // Stop all block instances via IPC
    for (const instanceId of this.#instanceIds) {
      this.#deps.plugins.stopBlockInstance(instanceId);
    }

    this.#instanceIds.clear();
    this.#connections.clear();
    this.#workflow = null;

    // Clear the block emit handler
    this.#deps.plugins.clearBlockEmitHandler();
    this.#deps.plugins.clearBlockLogHandler();

    this.#emit({
      type: 'workflow.stopped',
      workflowId,
    });

    this.#deps.logs.info('workflow.stopped', { id: workflowId });
  }

  /**
   * Check if a workflow is running
   */
  get isRunning(): boolean {
    return this.#workflow !== null;
  }

  /**
   * Get the running workflow ID
   */
  get workflowId(): string | null {
    return this.#workflow?.id ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Injection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Inject data into a block's input port.
   * Use this to trigger the workflow from external events.
   */
  inject(blockId: string, port: string, data: Json): boolean {
    if (!this.#instanceIds.has(blockId)) {
      this.#deps.logs.warn('workflow.inject.unknown', { blockId, port });
      return false;
    }

    this.#deps.plugins.pushBlockInput(blockId, port, data);
    return true;
  }

  /**
   * Retrigger the last value from a port (for debugging).
   */
  retrigger(blockId: string, port: string): boolean {
    const key = `${blockId}:${port}`;
    const buffer = this.#buffers.get(key);
    if (!buffer) return false;

    // Re-dispatch to downstream blocks
    this.#dispatch(blockId, port, buffer.value);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the last value from a port.
   */
  getPortValue(blockId: string, port: string): PortBuffer | undefined {
    return this.#buffers.get(`${blockId}:${port}`);
  }

  /**
   * Get all port buffers (for UI state display).
   */
  getAllBuffers(): PortBuffer[] {
    return [...this.#buffers.values()];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add a listener for execution events.
   */
  addListener(listener: ExecutionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────────

  #buildConnectionMap(workflow: Workflow): Map<string, BlockConnection[]> {
    const map = new Map<string, BlockConnection[]>();

    for (const conn of workflow.connections) {
      const key = `${conn.from}.${conn.fromPort ?? 'out'}`;
      const existing = map.get(key) ?? [];
      existing.push(conn);
      map.set(key, existing);
    }

    return map;
  }

  async #startBlock(block: WorkflowBlock, workflow: Workflow): Promise<void> {
    const resolvedType = this.#resolveBlockType(block.type);

    try {
      // Start the block via plugin IPC
      const result = await this.#deps.plugins.startBlock(
        resolvedType,
        block.id,
        workflow.id,
        block.config ?? {}
      );

      if (result.ok) {
        this.#instanceIds.add(block.id);
      } else {
        this.#emit({
          type: 'block.error',
          workflowId: workflow.id,
          blockId: block.id,
          error: result.error,
        });
        this.#deps.logs.error('block.start.error', { blockId: block.id, error: result.error });
      }
    } catch (e) {
      this.#emit({
        type: 'block.error',
        workflowId: workflow.id,
        blockId: block.id,
        error: String(e),
      });
      this.#deps.logs.error('block.start.error', { blockId: block.id, error: String(e) });
    }
  }

  /**
   * Called when a block emits data on an output port.
   */
  #onBlockEmit(blockId: string, port: string, data: Json): void {
    if (!this.#workflow) return;

    // Update buffer
    const key = `${blockId}:${port}`;
    const existing = this.#buffers.get(key);
    this.#buffers.set(key, {
      blockId,
      port,
      value: data,
      ts: Date.now(),
      count: (existing?.count ?? 0) + 1,
    });

    // Emit event
    this.#emit({
      type: 'block.emit',
      workflowId: this.#workflow.id,
      blockId,
      port,
      data,
    });

    // Dispatch to downstream blocks
    this.#dispatch(blockId, port, data);
  }

  /**
   * Called when a block emits a log message.
   */
  #onBlockLog(blockId: string, workflowId: string, level: string, message: string): void {
    // Only emit if this is from the current workflow
    if (this.#workflow?.id !== workflowId) return;

    this.#emit({
      type: 'block.log',
      workflowId,
      blockId,
      level,
      message,
    });
  }

  /**
   * Dispatch data to downstream blocks based on connections.
   */
  #dispatch(blockId: string, port: string, data: Json): void {
    const key = `${blockId}.${port}`;
    const targets = this.#connections.get(key) ?? [];

    for (const conn of targets) {
      if (this.#instanceIds.has(conn.to)) {
        const targetPort = conn.toPort ?? 'in';
        this.#deps.plugins.pushBlockInput(conn.to, targetPort, data);
      }
    }
  }

  #emit(event: ExecutionEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  /**
   * Resolve a block type - supports short names and full qualified names.
   */
  #resolveBlockType(type: string): string {
    if (type.includes(':')) return type;

    // Search for matching block by short name
    const allBlocks = this.#deps.blocks.list();
    const match = allBlocks.find((b) => b.type?.endsWith(`:${type}`));
    return match?.type ?? type;
  }
}
