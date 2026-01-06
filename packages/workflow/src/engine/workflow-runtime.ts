/**
 * Workflow Runtime
 *
 * Manages the lifecycle of an event-driven workflow.
 * Creates block instances, wires up the event bus, and handles start/stop.
 */

import type { Serializable } from '../serialization';
import type {
  BlockConfig,
  BlockInstance,
  BlockRuntimeState,
  BlockState,
  CompiledBlock,
  Workflow,
} from '../types';
import { EventBus, type EventObserver, type PortBuffer } from './event-bus';

// ─────────────────────────────────────────────────────────────────────────────
// Block Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of compiled block types.
 */
export interface BlockRegistry {
  get(type: string): CompiledBlock | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Executor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for executing tools.
 */
export interface ToolExecutor {
  call(toolId: string, args: Record<string, Serializable>): Promise<Serializable>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Options
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowRuntimeOptions {
  /** Block type registry */
  blocks: BlockRegistry;

  /** Tool executor for callTool */
  tools?: ToolExecutor;

  /** Log handler */
  onLog?: (blockId: string, level: string, message: string) => void;

  /** Block state change handler (for UI) */
  onBlockStateChange?: (blockId: string, state: BlockState) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime for an event-driven workflow.
 */
export class WorkflowRuntime {
  readonly #workflow: Workflow;
  readonly #blockRegistry: BlockRegistry;
  readonly #tools?: ToolExecutor;
  readonly #eventBus: EventBus;
  readonly #onLog?: (blockId: string, level: string, message: string) => void;
  readonly #onBlockStateChange?: (blockId: string, state: BlockState) => void;

  /** Block runtime states by ID */
  readonly #blocks = new Map<string, BlockRuntimeState>();

  /** Compiled block types by block ID */
  readonly #blockTypes = new Map<string, CompiledBlock>();

  /** Running state */
  #running = false;

  constructor(workflow: Workflow, options: WorkflowRuntimeOptions) {
    this.#workflow = workflow;
    this.#blockRegistry = options.blocks;
    this.#tools = options.tools;
    this.#onLog = options.onLog;
    this.#onBlockStateChange = options.onBlockStateChange;

    // Create event bus with handler
    this.#eventBus = new EventBus(workflow, (blockId, portId, data) =>
      this.#handleEvent(blockId, portId, data)
    );

    // Prepare blocks
    for (const block of workflow.blocks) {
      this.#prepareBlock(block);
    }
  }

  #prepareBlock(block: BlockConfig): void {
    const blockType = this.#blockRegistry.get(block.type);
    if (!blockType) {
      throw new Error(`Unknown block type: ${block.type}`);
    }

    // Validate config
    const configResult = blockType.configSchema.safeParse(block.config);
    if (!configResult.success) {
      throw new Error(`Invalid config for block ${block.id}: ${configResult.error.message}`);
    }

    this.#blockTypes.set(block.id, blockType);

    const state: BlockRuntimeState = {
      id: block.id,
      type: block.type,
      config: configResult.data as Record<string, unknown>,
      state: 'stopped',
      instance: null,
      buffer: [],
    };

    this.#blocks.set(block.id, state);
  }

  #handleEvent(blockId: string, portId: string, data: Serializable): void {
    const state = this.#blocks.get(blockId);
    if (!state) {
      console.warn(`Event to unknown block: ${blockId}`);
      return;
    }

    // If paused, buffer the event
    if (state.state === 'paused') {
      state.buffer.push({ portId, data });
      return;
    }

    // If stopped or no instance, ignore
    if (state.state === 'stopped' || !state.instance) {
      return;
    }

    // Push to the block instance
    state.instance.pushInput(portId, data);
  }

  #setBlockState(blockId: string, state: BlockState): void {
    const block = this.#blocks.get(blockId);
    if (block) {
      block.state = state;
      this.#onBlockStateChange?.(blockId, state);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the workflow.
   */
  start(): void {
    if (this.#running) return;
    this.#running = true;

    // Start all blocks
    for (const [blockId, state] of this.#blocks) {
      const blockType = this.#blockTypes.get(blockId);
      if (!blockType) continue;

      // Create runtime context
      const ctx = {
        blockId,
        workflowId: this.#workflow.workspace.id,
        config: state.config,
        emit: (portId: string, data: Serializable) => {
          if (!this.#running || state.state !== 'running') return;
          this.#eventBus.emit(blockId, portId, data);
        },
        log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => {
          this.#onLog?.(blockId, level, message);
        },
        callTool: (toolId: string, args: Record<string, Serializable>) => {
          if (!this.#tools) {
            return Promise.reject(new Error('No tool executor configured'));
          }
          return this.#tools.call(toolId, args);
        },
      };

      // Start the block
      this.#setBlockState(blockId, 'running');
      state.instance = blockType.start(ctx);
    }
  }

  /**
   * Stop the workflow.
   */
  stop(): void {
    if (!this.#running) return;
    this.#running = false;

    for (const state of this.#blocks.values()) {
      this.#setBlockState(state.id, 'stopped');
      if (state.instance) {
        state.instance.stop();
        state.instance = null;
      }
      state.buffer = [];
    }
  }

  /**
   * Pause a specific block.
   * Events will be buffered until resume.
   */
  pauseBlock(blockId: string): void {
    const state = this.#blocks.get(blockId);
    if (state && state.state === 'running') {
      this.#setBlockState(blockId, 'paused');
    }
  }

  /**
   * Resume a paused block.
   * Flushes buffered events.
   */
  resumeBlock(blockId: string): void {
    const state = this.#blocks.get(blockId);
    if (!state || state.state !== 'paused' || !state.instance) return;

    this.#setBlockState(blockId, 'running');

    // Flush buffered events
    const buffered = state.buffer;
    state.buffer = [];

    for (const { portId, data } of buffered) {
      state.instance.pushInput(portId, data);
    }
  }

  /**
   * Stop a specific block.
   */
  stopBlock(blockId: string): void {
    const state = this.#blocks.get(blockId);
    if (!state) return;

    this.#setBlockState(blockId, 'stopped');

    if (state.instance) {
      state.instance.stop();
      state.instance = null;
    }
    state.buffer = [];
  }

  /**
   * Get block state.
   */
  getBlockState(blockId: string): BlockState | undefined {
    return this.#blocks.get(blockId)?.state;
  }

  /**
   * Get all block states.
   */
  getBlockStates(): Map<string, BlockState> {
    const states = new Map<string, BlockState>();
    for (const [id, block] of this.#blocks) {
      states.set(id, block.state);
    }
    return states;
  }

  /**
   * Check if workflow is running.
   */
  get isRunning(): boolean {
    return this.#running;
  }

  /**
   * Get the event bus for observing events.
   */
  get eventBus(): EventBus {
    return this.#eventBus;
  }

  /**
   * Observe all events (for SSE, debugging).
   */
  observe(observer: EventObserver): () => void {
    return this.#eventBus.observe(observer);
  }

  /**
   * Get last value for a port.
   */
  getPortBuffer(blockId: string, portId: string): PortBuffer | undefined {
    return this.#eventBus.getPortBuffer(blockId, portId);
  }

  /**
   * Get all port buffers.
   */
  getAllPortBuffers(): PortBuffer[] {
    return this.#eventBus.getAllBuffers();
  }

  /**
   * Retrigger last value from a port.
   */
  retrigger(blockId: string, portId: string): Promise<boolean> {
    return this.#eventBus.retrigger(blockId, portId);
  }

  /**
   * Inject data into a port.
   */
  inject(blockId: string, portId: string, data: Serializable): Promise<void> {
    return this.#eventBus.inject(blockId, portId, data);
  }
}
