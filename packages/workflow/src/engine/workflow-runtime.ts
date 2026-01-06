/**
 * Workflow Runtime
 *
 * Manages the lifecycle of an event-driven workflow.
 * Creates block instances, wires up the event bus, and handles start/stop.
 * Supports pause/resume for individual blocks (useful for debugging).
 */

import type { Serializable } from '../serialization';
import type {
  BlockContext,
  BlockHandlers,
  BlockInstance,
  BlockRuntimeInstance,
  BlockState,
  CompiledBlock,
  Workflow,
} from '../types';
import { EventBus, type EventObserver, type PortBuffer } from './event-bus';

// ─────────────────────────────────────────────────────────────────────────────
// Block Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of block types.
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

  /** Block instances by ID */
  readonly #instances = new Map<string, BlockRuntimeInstance>();

  /** Block handlers by type */
  readonly #handlers = new Map<string, BlockHandlers>();

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

    // Create block instances
    for (const block of workflow.blocks) {
      this.#createInstance(block);
    }
  }

  #createInstance(block: BlockInstance): void {
    const blockType = this.#blockRegistry.get(block.type);
    if (!blockType) {
      throw new Error(`Unknown block type: ${block.type}`);
    }

    this.#handlers.set(block.id, blockType.handlers);

    const configResult = blockType.configSchema.safeParse(block.config);
    if (!configResult.success) {
      throw new Error(`Invalid config for block ${block.id}: ${configResult.error.message}`);
    }

    const instance: BlockRuntimeInstance = {
      id: block.id,
      type: block.type,
      config: configResult.data as Record<string, unknown>,
      state: 'stopped',
      timers: new Set(),
      buffer: [],
    };

    this.#instances.set(block.id, instance);
  }

  #buildContext(instance: BlockRuntimeInstance): BlockContext {
    return {
      blockId: instance.id,
      workflowId: this.#workflow.workspace.id,
      config: instance.config,

      emit: (portId: string, data: Serializable) => {
        if (!this.#running || instance.state !== 'running') return;
        this.#eventBus.emit(instance.id, portId, data);
      },

      log: (level, message) => {
        this.#onLog?.(instance.id, level, message);
      },

      callTool: (toolId, args) => {
        if (!this.#tools) {
          return Promise.reject(new Error('No tool executor configured'));
        }
        return this.#tools.call(toolId, args);
      },

      setTimeout: (callback, ms) => {
        const timer = setTimeout(() => {
          instance.timers.delete(timer);
          if (this.#running && instance.state === 'running') callback();
        }, ms);
        instance.timers.add(timer);
        return () => {
          clearTimeout(timer);
          instance.timers.delete(timer);
        };
      },

      setInterval: (callback, ms) => {
        const timer = setInterval(() => {
          if (this.#running && instance.state === 'running') callback();
        }, ms);
        instance.timers.add(timer);
        return () => {
          clearInterval(timer);
          instance.timers.delete(timer);
        };
      },
    };
  }

  async #handleEvent(blockId: string, portId: string, data: Serializable): Promise<void> {
    const instance = this.#instances.get(blockId);
    const handlers = this.#handlers.get(blockId);

    if (!instance || !handlers) {
      console.warn(`Event to unknown block: ${blockId}`);
      return;
    }

    // If paused, buffer the event
    if (instance.state === 'paused') {
      instance.buffer.push({ portId, data });
      return;
    }

    // If stopped, ignore
    if (instance.state === 'stopped') {
      return;
    }

    const ctx = this.#buildContext(instance);
    await handlers.onInput(portId, data, ctx);
  }

  #setBlockState(blockId: string, state: BlockState): void {
    const instance = this.#instances.get(blockId);
    if (instance) {
      instance.state = state;
      this.#onBlockStateChange?.(blockId, state);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the workflow.
   */
  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;

    // Start all blocks
    for (const [blockId, handlers] of this.#handlers) {
      const instance = this.#instances.get(blockId);
      if (instance) {
        this.#setBlockState(blockId, 'running');
        if (handlers.onStart) {
          const ctx = this.#buildContext(instance);
          await handlers.onStart(ctx);
        }
      }
    }
  }

  /**
   * Stop the workflow.
   */
  async stop(): Promise<void> {
    if (!this.#running) return;
    this.#running = false;

    for (const [blockId, handlers] of this.#handlers) {
      const instance = this.#instances.get(blockId);
      if (instance) {
        this.#setBlockState(blockId, 'stopped');
        if (handlers.onStop) {
          const ctx = this.#buildContext(instance);
          await handlers.onStop(ctx);
        }
        // Clear timers
        for (const timer of instance.timers) {
          clearTimeout(timer);
          clearInterval(timer);
        }
        instance.timers.clear();
        instance.buffer = [];
      }
    }
  }

  /**
   * Pause a specific block.
   * Events will be buffered until resume.
   */
  pauseBlock(blockId: string): void {
    const instance = this.#instances.get(blockId);
    if (instance && instance.state === 'running') {
      this.#setBlockState(blockId, 'paused');
    }
  }

  /**
   * Resume a paused block.
   * Flushes buffered events.
   */
  async resumeBlock(blockId: string): Promise<void> {
    const instance = this.#instances.get(blockId);
    const handlers = this.#handlers.get(blockId);
    if (!instance || !handlers || instance.state !== 'paused') return;

    this.#setBlockState(blockId, 'running');

    // Flush buffered events
    const buffered = instance.buffer;
    instance.buffer = [];

    const ctx = this.#buildContext(instance);
    for (const { portId, data } of buffered) {
      await handlers.onInput(portId, data, ctx);
    }
  }

  /**
   * Stop a specific block.
   */
  async stopBlock(blockId: string): Promise<void> {
    const instance = this.#instances.get(blockId);
    const handlers = this.#handlers.get(blockId);
    if (!instance) return;

    this.#setBlockState(blockId, 'stopped');

    if (handlers?.onStop) {
      const ctx = this.#buildContext(instance);
      await handlers.onStop(ctx);
    }

    for (const timer of instance.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    instance.timers.clear();
    instance.buffer = [];
  }

  /**
   * Get block state.
   */
  getBlockState(blockId: string): BlockState | undefined {
    return this.#instances.get(blockId)?.state;
  }

  /**
   * Get all block states.
   */
  getBlockStates(): Map<string, BlockState> {
    const states = new Map<string, BlockState>();
    for (const [id, instance] of this.#instances) {
      states.set(id, instance.state);
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
