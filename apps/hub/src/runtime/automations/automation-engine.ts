/**
 * Automation Engine
 *
 * Manages workflows with reactive, event-driven execution.
 * Workflows run indefinitely until stopped.
 */

import type { BlockDefinition } from '@brika/sdk';
import { inject, singleton } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger, ScopedLogger } from '@/runtime/logs/log-router';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { Workflow } from './types';
import { type ExecutionListener, WorkflowExecutor } from './workflow-executor';

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class AutomationEngine {
  private readonly logs: ScopedLogger = inject(Logger).withSource('automation');
  private readonly events = inject(EventSystem);
  private readonly blocks = inject(BlockRegistry);
  private readonly plugins = inject(PluginManager);
  private readonly pluginEvents = inject(PluginEventHandler);

  /** Registered workflows */
  readonly #workflows = new Map<string, Workflow>();

  /** Running workflow executors by ID */
  readonly #executors = new Map<string, WorkflowExecutor>();

  /** Global listeners for all workflow events (for SSE debug streaming) */
  readonly #globalListeners = new Set<ExecutionListener>();

  /** Event subscriptions for cleanup */
  #eventUnsubs: Array<() => void> = [];

  init(): void {
    this.logs.info('Automation engine initialized successfully', {});
  }

  /**
   * Create a new executor instance for a workflow
   */
  #createExecutor(): WorkflowExecutor {
    return new WorkflowExecutor({
      plugins: this.plugins,
      logs: this.logs,
      blocks: this.blocks,
      events: this.pluginEvents,
    });
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
   * Check if all block types needed by a workflow are available
   */
  #checkBlocks(workflow: Workflow): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const block of workflow.blocks) {
      if (!this.blocks.has(block.type)) {
        missing.push(block.type);
      }
    }
    return { ok: missing.length === 0, missing };
  }

  /**
   * Register a workflow - sets status based on block availability
   * Auto-starts if enabled and all blocks are available
   */
  register(workflow: Workflow): void {
    // Clean up existing
    if (this.#workflows.has(workflow.id)) {
      this.unregister(workflow.id);
    }

    // Check if all blocks are available
    const { ok, missing } = this.#checkBlocks(workflow);

    if (!ok) {
      // Missing blocks - set error status
      workflow.status = 'error';
      workflow.error = `Missing blocks: ${missing.join(', ')}`;
      this.#workflows.set(workflow.id, workflow);
      this.logs.warn('Workflow registration failed due to missing blocks', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        missingBlocks: missing,
      });
      return;
    }

    // Clear any previous error
    workflow.error = undefined;
    workflow.status = 'stopped';

    this.#workflows.set(workflow.id, workflow);
    this.logs.info('Workflow registered successfully', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      enabled: workflow.enabled,
    });

    // Auto-start if enabled
    if (workflow.enabled) {
      this.#startWorkflowInternal(workflow.id).catch((err) => {
        this.logs.error(
          'Failed to auto-start workflow',
          {
            workflowId: workflow.id,
            workflowName: workflow.name,
          },
          { error: err }
        );
      });
    }
  }

  /** Unregister a workflow */
  unregister(id: string): boolean {
    const workflow = this.#workflows.get(id);
    if (!workflow) return false;

    // Stop if this workflow is running
    this.#stopWorkflowInternal(id);

    this.#workflows.delete(id);
    this.logs.info('Workflow unregistered successfully', { workflowId: id });
    return true;
  }

  /**
   * Internal: Start a workflow
   */
  async #startWorkflowInternal(id: string): Promise<void> {
    const workflow = this.#workflows.get(id);
    if (!workflow) return;

    // Don't start if already running
    if (this.#executors.has(id)) return;

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
      const executor = this.#createExecutor();
      this.#executors.set(id, executor);

      // Add listener that broadcasts to global listeners
      executor.addListener((event) => {
        for (const listener of this.#globalListeners) {
          listener(event);
        }
      });

      // Update status and startedAt
      workflow.status = 'running';
      workflow.startedAt = Date.now();
      workflow.error = undefined;

      await executor.start(workflow);
      this.logs.info('Workflow started successfully', {
        workflowId: id,
        workflowName: workflow.name,
        startedAt: workflow.startedAt,
      });
    } catch (err) {
      // Set error status
      workflow.status = 'error';
      workflow.error = String(err);
      workflow.startedAt = undefined;
      this.#executors.delete(id);
      this.logs.error(
        'Failed to start workflow',
        {
          workflowId: id,
          workflowName: workflow.name,
        },
        { error: err }
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
      workflow.status = 'stopped';
      workflow.startedAt = undefined;
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

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const workflow = this.#workflows.get(id);
    if (!workflow) return false;

    workflow.enabled = enabled;

    if (enabled) {
      // Re-check blocks before starting (in case they're now available)
      const { ok, missing } = this.#checkBlocks(workflow);
      if (!ok) {
        workflow.status = 'error';
        workflow.error = `Missing blocks: ${missing.join(', ')}`;
        return true;
      }

      // Clear error and start
      workflow.error = undefined;
      await this.#startWorkflowInternal(id);
    } else {
      // Stop the workflow
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
    for (const unsub of this.#eventUnsubs) unsub();
    this.#eventUnsubs = [];

    this.logs.info('Automation engine stopped successfully', {});
  }
}
