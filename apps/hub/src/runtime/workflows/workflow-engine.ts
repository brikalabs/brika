/**
 * Workflow Engine
 *
 * Manages workflows with reactive, event-driven execution.
 * Workflows run indefinitely until stopped.
 */

import { inject, singleton } from '@brika/di';
import type { BlockDefinition } from '@brika/sdk';
import { BlockRegistry } from '@/runtime/blocks';
import { Logger, type ScopedLogger } from '@/runtime/logs/log-router';
import type { Workflow } from './types';
import { type ExecutionListener, WorkflowExecutor } from './workflow-executor';

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class WorkflowEngine {
  private readonly logs: ScopedLogger = inject(Logger).withSource('workflow');
  private readonly blocks = inject(BlockRegistry);

  /** Registered workflows */
  readonly #workflows = new Map<string, Workflow>();

  /** Running workflow executors by ID */
  readonly #executors = new Map<string, WorkflowExecutor>();

  /** Global listeners for all workflow events (for SSE debug streaming) */
  readonly #globalListeners = new Set<ExecutionListener>();

  /** Event subscriptions for cleanup */
  #eventUnsubs: Array<() => void> = [];

  /** Workflows waiting for missing blocks */
  readonly #pendingBlocks = new Set<string>();

  init(): void {
    this.#eventUnsubs.push(
      this.blocks.onBlockRegistered(() => {
        for (const id of this.#pendingBlocks) {
          const workflow = this.#workflows.get(id);
          if (workflow) {
            this.#tryStart(workflow);
          }
        }
      })
    );

    this.logs.info('Workflow engine initialized successfully', {});
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Block Registry Passthrough
  // ─────────────────────────────────────────────────────────────────────────────

  /** Get all registered block types */
  getBlockTypes(): BlockDefinition[] {
    return this.blocks.list();
  }

  /** Get blocks grouped by category */
  getBlocksByCategory(): Record<string, BlockDefinition[]> {
    return this.blocks.listByCategory();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update workflow state in a centralized way.
   */
  #updateWorkflowState(
    workflow: Workflow,
    status: 'stopped' | 'running' | 'error',
    error?: string
  ): void {
    workflow.status = status;
    workflow.error = error;
    workflow.startedAt = status === 'running' ? Date.now() : undefined;
  }

  /**
   * Check if all block types needed by a workflow are available.
   * Returns list of missing block types.
   */
  #validateBlocks(workflow: Workflow): string[] {
    const missing: string[] = [];
    for (const block of workflow.blocks) {
      const resolved = this.blocks.resolve(block.type);
      if (!this.blocks.has(resolved)) {
        missing.push(block.type);
      }
    }
    return missing;
  }

  /** Validate blocks and start if enabled, otherwise mark as pending/stopped */
  #tryStart(workflow: Workflow): void {
    const missing = this.#validateBlocks(workflow);
    if (missing.length > 0) {
      this.#pendingBlocks.add(workflow.id);
      this.#updateWorkflowState(workflow, 'error', `Missing blocks: ${missing.join(', ')}`);
      return;
    }

    this.#pendingBlocks.delete(workflow.id);
    this.#updateWorkflowState(workflow, 'stopped');

    if (workflow.enabled) {
      this.#startWorkflowInternal(workflow.id).catch((err) => {
        this.logs.error('Failed to start workflow', { workflowId: workflow.id, error: err });
      });
    }
  }

  /**
   * Register a workflow - sets status based on block availability.
   * Auto-starts if enabled and all blocks are available.
   */
  register(workflow: Workflow): void {
    if (this.#workflows.has(workflow.id)) {
      this.unregister(workflow.id);
    }

    this.#workflows.set(workflow.id, workflow);
    this.#tryStart(workflow);
  }

  /** Unregister a workflow */
  unregister(id: string): boolean {
    const workflow = this.#workflows.get(id);
    if (!workflow) {
      return false;
    }

    // Stop if this workflow is running
    this.#stopWorkflowInternal(id);

    this.#workflows.delete(id);
    this.#pendingBlocks.delete(id);
    this.logs.info('Workflow unregistered successfully', {
      workflowId: id,
    });
    return true;
  }

  /**
   * Internal: Start a workflow
   */
  async #startWorkflowInternal(id: string): Promise<void> {
    const workflow = this.#workflows.get(id);
    if (!workflow) {
      return;
    }

    // Don't start if already running
    if (this.#executors.has(id)) {
      return;
    }

    // Don't start if in error state
    if (workflow.status === 'error') {
      this.logs.warn('Cannot start workflow in error state', {
        workflowId: id,
        workflowName: workflow.name,
        error: workflow.error,
      });
      return;
    }

    try {
      const executor = new WorkflowExecutor();
      this.#executors.set(id, executor);

      // Add listener that broadcasts to global listeners
      executor.addListener((event) => {
        for (const listener of this.#globalListeners) {
          listener(event);
        }
      });

      // Update status and startedAt
      this.#updateWorkflowState(workflow, 'running');

      await executor.start(workflow);
      this.logs.info('Workflow started successfully', {
        workflowId: id,
        workflowName: workflow.name,
        startedAt: workflow.startedAt,
      });
    } catch (err) {
      // Set error status
      this.#updateWorkflowState(workflow, 'error', String(err));
      this.#executors.delete(id);
      this.logs.error(
        'Failed to start workflow',
        {
          workflowId: id,
          workflowName: workflow.name,
        },
        {
          error: err,
        }
      );
    }
  }

  /**
   * Internal: Stop a workflow
   */
  #stopWorkflowInternal(id: string): void {
    const executor = this.#executors.get(id);
    if (executor) {
      executor.stop();
      this.#executors.delete(id);
    }

    // Update workflow state
    const workflow = this.#workflows.get(id);
    if (workflow?.status === 'running') {
      this.#updateWorkflowState(workflow, 'stopped');
    }

    this.logs.info('Workflow stopped successfully', {
      workflowId: id,
      workflowName: workflow?.name,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow Execution
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add a global listener for ALL workflow execution events.
   * Useful for SSE streaming and debugging.
   */
  addGlobalListener(listener: ExecutionListener): () => void {
    this.#globalListeners.add(listener);
    return () => this.#globalListeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────────

  get(id: string): Workflow | undefined {
    return this.#workflows.get(id);
  }

  /**
   * Check if a specific workflow is running
   */
  isWorkflowRunning(id: string): boolean {
    return this.#executors.has(id);
  }

  list(): Workflow[] {
    return [...this.#workflows.values()]
      .map((w) => ({
        ...w,
        enabled: w.enabled ?? false,
      }))
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const workflow = this.#workflows.get(id);
    if (!workflow) {
      return false;
    }

    workflow.enabled = enabled;

    if (enabled) {
      this.#tryStart(workflow);
    } else {
      this.#stopWorkflowInternal(id);
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  stop(): void {
    // Stop all running workflows
    for (const [id, executor] of this.#executors) {
      executor.stop();
      const workflow = this.#workflows.get(id);
      this.logs.info('Workflow stopped successfully', {
        workflowId: id,
        workflowName: workflow?.name,
      });
    }
    this.#executors.clear();

    // Clean up event subscriptions
    for (const unsub of this.#eventUnsubs) {
      unsub();
    }
    this.#eventUnsubs = [];

    this.logs.info('Workflow engine stopped successfully', {});
  }
}
