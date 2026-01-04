/**
 * Automation Engine
 *
 * Manages workflows and executes them via plugin-based blocks.
 */

import type { BlockDefinition, Workflow } from '@elia/sdk';
import type { Json } from '@elia/shared';
import { inject, singleton } from '@elia/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { EventSystem } from '@/runtime/events/event-system';
import { LogRouter } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { ToolRegistry } from '@/runtime/tools/tool-registry';
import { type ExecutionListener, WorkflowExecutor } from './workflow-executor';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class AutomationEngine {
  private readonly logs = inject(LogRouter);
  private readonly events = inject(EventSystem);
  private readonly tools = inject(ToolRegistry);
  private readonly blocks = inject(BlockRegistry);
  private readonly plugins = inject(PluginManager);

  /** Registered workflows */
  readonly #workflows = new Map<string, Workflow>();

  /** Event subscriptions for cleanup */
  #eventUnsubs: Array<() => void> = [];

  /** Recent runs */
  readonly #runs: WorkflowRun[] = [];

  /** Executor instance */
  #executor: WorkflowExecutor | null = null;

  async init(): Promise<void> {
    // Create executor
    this.#executor = new WorkflowExecutor({
      plugins: this.plugins,
      tools: this.tools,
      events: this.events,
      logs: this.logs,
      blocks: this.blocks,
    });

    this.logs.info('automation.engine.started');
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

  /** Register a workflow */
  register(workflow: Workflow): void {
    // Clean up existing
    if (this.#workflows.has(workflow.id)) {
      this.unregister(workflow.id);
    }

    this.#workflows.set(workflow.id, workflow);
    this.logs.info('workflow.registered', { id: workflow.id, name: workflow.name ?? null });

    // Skip if disabled
    if (workflow.enabled === false) return;

    // Set up event trigger
    if (workflow.trigger.event) {
      const pattern = workflow.trigger.event;
      const unsub = this.events.subscribe(pattern, async (action) => {
        // Check filter if present
        if (workflow.trigger.filter) {
          for (const [k, v] of Object.entries(workflow.trigger.filter)) {
            const payload = action.payload as Record<string, Json>;
            if (payload[k] !== v) return;
          }
        }
        await this.trigger(
          workflow.id,
          action.type,
          action.source ?? 'unknown',
          action.payload as Json
        );
      });
      this.#eventUnsubs.push(unsub);
    }
  }

  /** Unregister a workflow */
  unregister(id: string): boolean {
    const workflow = this.#workflows.get(id);
    if (!workflow) return false;
    this.#workflows.delete(id);
    this.logs.info('workflow.unregistered', { id });
    return true;
  }

  /** Trigger a workflow */
  async trigger(
    id: string,
    eventType: string,
    source: string,
    payload: Json,
    listener?: ExecutionListener
  ): Promise<WorkflowRun> {
    const workflow = this.#workflows.get(id);
    if (!workflow) throw new Error(`Workflow not found: ${id}`);
    if (!this.#executor) throw new Error('Engine not initialized');

    const run: WorkflowRun = {
      id: crypto.randomUUID(),
      workflowId: id,
      status: 'running',
      startedAt: Date.now(),
    };

    this.#runs.push(run);
    if (this.#runs.length > 1000) this.#runs.shift();

    // Set up listener if provided
    if (listener) {
      this.#executor.onEvent(listener);
    }

    try {
      this.logs.info('workflow.started', { id, runId: run.id, trigger: eventType });
      await this.#executor.run(workflow, { type: eventType, payload, source });
      run.status = 'completed';
      run.finishedAt = Date.now();
      this.logs.info('workflow.finished', {
        id,
        runId: run.id,
        duration: run.finishedAt - run.startedAt,
      });
    } catch (error) {
      run.status = 'error';
      run.error = String(error);
      run.finishedAt = Date.now();
      this.logs.error('workflow.error', { id, runId: run.id, error: run.error });
    }

    return run;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────────

  get(id: string): Workflow | undefined {
    return this.#workflows.get(id);
  }

  list(): Workflow[] {
    return [...this.#workflows.values()]
      .map((w) => ({
        ...w,
        enabled: w.enabled ?? true,
      }))
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  }

  listRuns(limit = 100): WorkflowRun[] {
    return this.#runs.slice(-limit).reverse();
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const workflow = this.#workflows.get(id);
    if (!workflow) return false;

    const updated = { ...workflow, enabled };
    this.unregister(id);
    this.register(updated);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  async stop(): Promise<void> {
    for (const unsub of this.#eventUnsubs) unsub();
    this.#eventUnsubs = [];
    this.logs.info('automation.engine.stopped');
  }
}
