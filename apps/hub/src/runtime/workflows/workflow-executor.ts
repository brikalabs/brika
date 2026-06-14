/**
 * Workflow Executor
 *
 * Reactive, event-driven workflow runtime.
 * Starts a workflow and runs it indefinitely until stopped.
 * Data flows through blocks via port connections.
 */

import { inject } from '@brika/di';
import type { BlockTrigger } from '@brika/sdk';
import { inferType, isCompatible, type TypeDescriptor } from '@brika/type-system';
import { BlockRegistry } from '@/runtime/blocks';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { Json } from '@/types';
import { TriggerRegistry } from './trigger-registry';
import type { BlockConnection, Workflow, WorkflowBlock } from './types';

/**
 * Events emitted during workflow execution.
 *
 * `correlationId` groups events into a "run": a best-effort causal slice of the
 * always-on event stream (a trigger/source/inject emission opens one; downstream
 * blocks inherit it; a quiescence window closes it). It is tracked hub-side only
 * (the plugin IPC boundary is fire-and-forget, so true per-event causation is not
 * recoverable without invasive IPC/SDK changes). `block.start` marks a block
 * receiving input ("running"); `block.emit` marks it producing output
 * ("completed"). New event kinds and the optional field are additive so the debug
 * SSE and existing UI keep working unchanged.
 */
export interface ExecutionEvent {
  type:
    | 'workflow.started'
    | 'workflow.stopped'
    | 'run.opened'
    | 'run.closed'
    | 'block.start'
    | 'block.emit'
    | 'block.log'
    | 'block.error';
  workflowId: string;
  /** Run this event belongs to. Absent for pre-run lifecycle (workflow.started/stopped, startup errors). */
  correlationId?: string;
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
  readonly #plugins = inject(PluginManager);
  readonly #logs = inject(Logger).withSource('workflow');
  readonly #blocks = inject(BlockRegistry);
  readonly #listeners = new Set<ExecutionListener>();

  // Active workflow state
  #workflow: Workflow | null = null;
  readonly #instanceIds = new Set<string>(); // Block instance IDs
  /** Plugins that provide this workflow's blocks; pinned against reaping while running. */
  readonly #providerPlugins = new Set<string>();
  /** Disposer for the reap guard registered in start(). */
  #reapGuardDispose: (() => void) | null = null;
  /** Host-scheduled triggers for this workflow's hub-owned trigger blocks. */
  readonly #triggers = new TriggerRegistry();
  /** Per-trigger fire count, so each tick carries an incrementing `count`. */
  readonly #triggerFireCount = new Map<string, number>();
  /** Per-instance delivery chains: serialize delivery + respawn for one block. */
  readonly #deliverChains = new Map<string, Promise<void>>();
  #connections = new Map<string, BlockConnection[]>(); // "blockId.port" -> targets
  readonly #buffers = new Map<string, PortBuffer>(); // "blockId:port" -> last value
  // This executor's own emit/log handlers, kept so stop() removes exactly its
  // own (the plugin event handler now fans out to every running workflow).
  #blockEmitHandler:
    | ((instanceId: string, port: string, data: Json, causationId?: string) => void)
    | null = null;
  #blockLogHandler:
    | ((
        instanceId: string,
        workflowId: string,
        level: string,
        message: string,
        data?: Json
      ) => void)
    | null = null;
  readonly #blockDefCache = new Map<
    string,
    { block: WorkflowBlock; def: import('@brika/sdk').BlockDefinition } | null
  >(); // blockId -> cached lookup

  // ── Run correlation (hub-side, best-effort) ──────────────────────────────────
  /** Milliseconds of inactivity on a run before it is considered closed. */
  static readonly #QUIESCENCE_MS = 2000;
  /** Block instances with no inbound connection (run roots), computed in start(). */
  readonly #sourceInstances = new Set<string>();
  /** Most-recent inbound correlationId per block instance. */
  readonly #lastCorrelationId = new Map<string, string>();
  /** Open runs -> their quiescence timer. */
  readonly #openRuns = new Map<string, ReturnType<typeof setTimeout>>();

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
    this.#blockDefCache.clear();
    this.#buildBlockDefCache(workflow);
    this.#computeSourceInstances(workflow);
    this.#lastCorrelationId.clear();

    // Pin every plugin this workflow depends on against scale-to-zero reaping,
    // BEFORE starting any block, so a concurrent reaper sweep cannot kill a
    // plugin out from under the workflow as it boots. The guard is removed in
    // stop(). With reaping off this registers an inert predicate.
    // Pin only the providers that MUST stay resident: in-plugin source blocks
    // (run roots that run their own timer/subscription in the plugin). A hosted
    // trigger fires from the hub, and a downstream block is re-created on demand
    // when input arrives (see #deliverOnce), so their plugins may reap while
    // idle and respawn on the next event. This is what lets an action plugin
    // scale to zero between infrequent trigger fires. A respawned downstream
    // block is re-created fresh, so a block must not rely on in-memory state
    // surviving an idle reap (persist via the storage API if it must endure).
    this.#providerPlugins.clear();
    for (const block of workflow.blocks) {
      const isInPluginSource = this.#sourceInstances.has(block.id) && !this.#hostedTrigger(block);
      if (!isInPluginSource) {
        continue;
      }
      const provider = this.#blocks.getProvider(this.#resolveBlockType(block.type));
      if (provider) {
        this.#providerPlugins.add(provider);
      }
    }
    this.#reapGuardDispose = this.#plugins.addReapGuard((name) => this.#providerPlugins.has(name));

    // Register this workflow's own emit/log handlers (kept as refs so stop()
    // removes exactly these, not every workflow's).
    this.#blockEmitHandler = (
      instanceId: string,
      port: string,
      data: Json,
      causationId?: string
    ) => {
      this.#onBlockEmit(instanceId, port, data, causationId);
    };
    this.#plugins.setBlockEmitHandler(this.#blockEmitHandler);

    this.#blockLogHandler = (
      instanceId: string,
      workflowId: string,
      level: string,
      message: string,
      data?: Json
    ) => {
      this.#onBlockLog(instanceId, workflowId, level, message, data);
    };
    this.#plugins.setBlockLogHandler(this.#blockLogHandler);

    // Start all blocks. Hub-owned triggers are scheduled here instead of being
    // started in the plugin, so their plugin need not be resident.
    for (const block of workflow.blocks) {
      const trigger = this.#hostedTrigger(block);
      if (trigger) {
        this.#startHostedTrigger(block, trigger, workflow);
      } else {
        await this.#startBlock(block, workflow);
      }
    }

    this.#emit({
      type: 'workflow.started',
      workflowId: workflow.id,
    });

    this.#logs.info('Workflow started successfully', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      blockCount: workflow.blocks.length,
    });
  }

  /**
   * Stop the running workflow - cleans up all blocks.
   */
  stop(): void {
    if (!this.#workflow) {
      return;
    }

    const workflowId = this.#workflow.id;

    // Close any open runs (emits run.closed, clears their quiescence timers).
    // Map iteration tolerates deletion of the current key by #closeRun.
    for (const cid of this.#openRuns.keys()) {
      this.#closeRun(workflowId, cid);
    }
    this.#lastCorrelationId.clear();
    this.#sourceInstances.clear();

    // Cancel host-scheduled triggers for this workflow.
    this.#triggers.clear();
    this.#triggerFireCount.clear();
    this.#deliverChains.clear();

    // Release the reap pins: the plugins this workflow held resident may now be
    // reaped once they go idle (unless another running workflow still owns them).
    this.#reapGuardDispose?.();
    this.#reapGuardDispose = null;
    this.#providerPlugins.clear();

    // Stop all block instances via IPC
    for (const instanceId of this.#instanceIds) {
      this.#plugins.stopBlockInstance(instanceId);
    }

    this.#instanceIds.clear();
    this.#connections.clear();
    this.#buffers.clear();
    this.#blockDefCache.clear();
    this.#workflow = null;

    // Remove only THIS workflow's handlers, leaving other running workflows'
    // routing intact.
    if (this.#blockEmitHandler) {
      this.#plugins.clearBlockEmitHandler(this.#blockEmitHandler);
      this.#blockEmitHandler = null;
    }
    if (this.#blockLogHandler) {
      this.#plugins.clearBlockLogHandler(this.#blockLogHandler);
      this.#blockLogHandler = null;
    }

    this.#emit({
      type: 'workflow.stopped',
      workflowId,
    });

    this.#logs.info('Workflow stopped successfully', {
      workflowId,
    });
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
  inject(blockId: string, port: string, data: Json, options?: { replay?: boolean }): boolean {
    const workflow = this.#workflow;
    if (!workflow) {
      return false;
    }
    if (!this.#instanceIds.has(blockId)) {
      this.#logs.warn('Cannot inject data into unknown block instance', {
        blockId,
        port,
      });
      return false;
    }

    // Replay: re-trigger the block with the value that last flowed into this
    // input (the freshest upstream buffer across fan-in). Falls back to the
    // provided payload when nothing has flowed yet.
    const payload = options?.replay ? (this.#lastInputValue(blockId, port) ?? data) : data;

    // An external injection is a fresh run root.
    const correlationId = crypto.randomUUID();
    this.#lastCorrelationId.set(blockId, correlationId);
    this.#emit({ type: 'run.opened', workflowId: workflow.id, blockId, correlationId });
    this.#emit({ type: 'block.start', workflowId: workflow.id, blockId, port, correlationId });

    this.#deliverTo(blockId, port, payload, correlationId);
    return true;
  }

  /**
   * The value that last arrived on a block's input port: the most recent
   * output buffer among the connections feeding it (fan-in picks the
   * freshest). Undefined when nothing has flowed yet.
   */
  #lastInputValue(blockId: string, port: string): Json | undefined {
    const connections = this.#workflow?.connections ?? [];
    let best: PortBuffer | undefined;
    for (const conn of connections) {
      if (conn.to !== blockId || (conn.toPort ?? 'in') !== port) {
        continue;
      }
      const buffer = this.#buffers.get(`${conn.from}:${conn.fromPort ?? 'out'}`);
      if (buffer && (!best || buffer.ts > best.ts)) {
        best = buffer;
      }
    }
    return best?.value;
  }

  /** Whether this executor is running the given block instance. */
  ownsBlock(blockId: string): boolean {
    return this.#instanceIds.has(blockId);
  }

  /**
   * Last value seen on each output port since start. Lets the editor restore
   * node previews and {{ }} resolution after a reload instead of waiting for
   * the next emission.
   */
  portBuffers(): PortBuffer[] {
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
      const result = await this.#plugins.startBlock(
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
        this.#logs.error(
          'Failed to start workflow block',
          {
            blockId: block.id,
            blockType: block.type,
            workflowId: workflow.id,
          },
          {
            error: new Error(result.error || 'Unknown error'),
          }
        );
      }
    } catch (e) {
      this.#emit({
        type: 'block.error',
        workflowId: workflow.id,
        blockId: block.id,
        error: String(e),
      });
      this.#logs.error(
        'Failed to start workflow block',
        {
          blockId: block.id,
          blockType: block.type,
          workflowId: workflow.id,
        },
        {
          error: e,
        }
      );
    }
  }

  /**
   * The hosted-trigger declaration for a block, if it is a hub-owned trigger of
   * a kind this hub understands. An unknown/absent kind degrades to a normal
   * block, which is what makes new trigger kinds forward-compatible.
   */
  #hostedTrigger(block: WorkflowBlock): BlockTrigger | undefined {
    const trigger = this.#blockDefCache.get(block.id)?.def.trigger;
    return trigger?.kind === 'interval' ? trigger : undefined;
  }

  /**
   * Schedule a hub-owned trigger block. The hub drives the interval and fires
   * the block's output, so the providing plugin needs no resident process. The
   * block is recorded as a run root so dispatch/ownsBlock treat it like a source.
   */
  #startHostedTrigger(block: WorkflowBlock, trigger: BlockTrigger, workflow: Workflow): void {
    this.#instanceIds.add(block.id);
    this.#triggerFireCount.set(block.id, 0);
    const intervalMs = Number((block.config ?? {})[trigger.intervalField]);
    const scheduled = this.#triggers.register(block.id, { kind: 'interval', intervalMs }, () =>
      this.#fireTrigger(block.id, trigger.output)
    );
    if (!scheduled) {
      this.#emit({
        type: 'block.error',
        workflowId: workflow.id,
        blockId: block.id,
        error: `Trigger not scheduled: config "${trigger.intervalField}" must be a positive number of milliseconds`,
      });
    }
  }

  /**
   * Fire a hub-owned trigger: emit a `{ count, ts }` tick on its output through
   * the normal run path (opens a fresh run, buffers, dispatches downstream).
   */
  #fireTrigger(blockId: string, port: string): void {
    const count = (this.#triggerFireCount.get(blockId) ?? 0) + 1;
    this.#triggerFireCount.set(blockId, count);
    this.#onBlockEmit(blockId, port, { count, ts: Date.now() });
  }

  /**
   * Called when a block emits data on an output port.
   */
  #onBlockEmit(blockId: string, port: string, data: Json, causationId?: string): void {
    const workflow = this.#workflow;
    if (!workflow) {
      return;
    }

    // The plugin event handler broadcasts every block emit to all running
    // workflows; ignore blocks this workflow does not own.
    if (!this.#instanceIds.has(blockId)) {
      return;
    }

    // Determine the run this emit belongs to. The SDK traces causation through
    // the block's async handlers, so an emit normally names the exact run that
    // caused it (fan-in safe). Fallbacks: a source (no inbound connection)
    // opens a fresh run on every uncaused emit; a downstream block inherits
    // the correlation of its most recent input (lazily opening one if it
    // emitted without a recorded input, e.g. a timer block).
    let correlationId = causationId;
    if (!correlationId) {
      correlationId = this.#lastCorrelationId.get(blockId);
      if (!correlationId || this.#sourceInstances.has(blockId)) {
        correlationId = crypto.randomUUID();
        this.#emit({
          type: 'run.opened',
          workflowId: workflow.id,
          blockId,
          correlationId,
        });
      }
    }
    this.#lastCorrelationId.set(blockId, correlationId);

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

    // Emit event (block produced output -> "completed" in the UI)
    this.#emit({
      type: 'block.emit',
      workflowId: workflow.id,
      blockId,
      port,
      data,
      correlationId,
    });

    // Dispatch to downstream blocks, carrying the run forward.
    this.#dispatch(workflow.id, blockId, port, data, correlationId);
  }

  /**
   * Called when a block emits a log message.
   */
  #onBlockLog(
    blockId: string,
    workflowId: string,
    level: string,
    message: string,
    data?: Json
  ): void {
    // Only emit if this is from the current workflow
    if (this.#workflow?.id !== workflowId) {
      return;
    }

    this.#emit({
      type: 'block.log',
      workflowId,
      blockId,
      level,
      message,
      data,
      correlationId: this.#lastCorrelationId.get(blockId),
    });
  }

  /**
   * Dispatch data to downstream blocks based on connections.
   * Validates data against target port types before delivery.
   */
  #dispatch(
    workflowId: string,
    blockId: string,
    port: string,
    data: Json,
    correlationId: string
  ): void {
    const key = `${blockId}.${port}`;
    const targets = this.#connections.get(key) ?? [];

    for (const conn of targets) {
      if (!this.#instanceIds.has(conn.to)) {
        continue;
      }

      const targetPort = conn.toPort ?? 'in';

      // Validate data against target port type
      if (!this.#validatePortData(conn.to, targetPort, data, correlationId)) {
        continue; // Skip this target — surfaced as a block.error in the run
      }

      // Carry the run forward to the target and mark it running.
      this.#lastCorrelationId.set(conn.to, correlationId);
      this.#emit({
        type: 'block.start',
        workflowId,
        blockId: conn.to,
        port: targetPort,
        correlationId,
      });

      this.#deliverTo(conn.to, targetPort, data, correlationId);
    }
  }

  /**
   * Deliver input to a block instance, respawning its plugin if scale-to-zero
   * reaped it. Fast path: a single broadcast that the owning process handles.
   * Slow path (no owner): the plugin was reaped while idle between events, so
   * re-create the instance (startBlock, which lazily respawns the plugin) and
   * retry once. Deliveries to one instance are serialized so a burst neither
   * double-respawns nor reorders, and the queued events act as the front-door
   * buffer that holds work while the plugin boots.
   */
  #deliverTo(blockId: string, port: string, data: Json, correlationId: string): void {
    const pending = this.#deliverChains.get(blockId);
    if (!pending) {
      // Fast path: no respawn in flight for this instance, deliver synchronously
      // to the resident owner. This keeps the common case allocation- and
      // microtask-free, and delivery stays synchronous (what callers expect).
      if (this.#plugins.pushBlockInput(blockId, port, data, correlationId)) {
        return;
      }
      // No owner: the target's plugin was reaped. Begin a respawn+deliver chain.
      this.#enqueueDeliver(blockId, Promise.resolve(), port, data, correlationId);
      return;
    }
    // A respawn is already in flight for this instance: queue behind it so a
    // burst delivers in order and respawns at most once.
    this.#enqueueDeliver(blockId, pending, port, data, correlationId);
  }

  #enqueueDeliver(
    blockId: string,
    prev: Promise<void>,
    port: string,
    data: Json,
    correlationId: string
  ): void {
    const run = prev.then(() => this.#deliverOnce(blockId, port, data, correlationId));
    // Swallow rejections so one failed delivery cannot wedge the chain, and drop
    // the chain entry once drained so later deliveries take the sync fast path.
    const guarded = run
      .catch(() => undefined)
      .then(() => {
        if (this.#deliverChains.get(blockId) === guarded) {
          this.#deliverChains.delete(blockId);
        }
      });
    this.#deliverChains.set(blockId, guarded);
  }

  async #deliverOnce(
    blockId: string,
    port: string,
    data: Json,
    correlationId: string
  ): Promise<void> {
    if (this.#plugins.pushBlockInput(blockId, port, data, correlationId)) {
      return;
    }
    // No resident owner: the target's plugin was reaped. Re-create the instance
    // (respawns the plugin on demand) then deliver. Bail if the workflow stopped
    // while this was queued.
    const workflow = this.#workflow;
    const entry = this.#blockDefCache.get(blockId);
    if (!workflow || !entry || !this.#instanceIds.has(blockId)) {
      return;
    }
    const resolvedType = this.#resolveBlockType(entry.block.type);
    const result = await this.#plugins.startBlock(
      resolvedType,
      blockId,
      workflow.id,
      entry.block.config ?? {}
    );
    if (!this.#instanceIds.has(blockId)) {
      // The workflow stopped during the respawn. startBlock may have revived the
      // plugin and created a live instance; stop it so it does not linger
      // untracked (which would also collide with a later restart's startBlock).
      if (result.ok) {
        this.#plugins.stopBlockInstance(blockId);
      }
      return;
    }
    if (!result.ok) {
      this.#emit({
        type: 'block.error',
        workflowId: workflow.id,
        blockId,
        error: result.error ?? 'Failed to respawn block for delivery',
      });
      return;
    }
    if (!this.#plugins.pushBlockInput(blockId, port, data, correlationId)) {
      // Respawned but still no owner: surface it rather than silently dropping.
      this.#emit({
        type: 'block.error',
        workflowId: workflow.id,
        blockId,
        error: 'Respawned block but delivery found no owner',
      });
    }
  }

  /**
   * Validate data against a target port's declared type.
   * Returns true if valid (or if type info unavailable), false if invalid.
   */
  #validatePortData(blockId: string, portId: string, data: Json, correlationId: string): boolean {
    if (!this.#workflow) {
      return true;
    }

    // Use cached block def lookup (O(1) instead of O(n))
    const cached = this.#blockDefCache.get(blockId);
    if (!cached) {
      return true;
    }

    const portDef = cached.def.inputs.find((p) => p.id === portId);
    if (!portDef) {
      return true;
    }

    // Use structural TypeDescriptor if available, otherwise skip validation
    const portType = portDef.type as TypeDescriptor | undefined;
    if (
      !portType ||
      portType.kind === 'any' ||
      portType.kind === 'unknown' ||
      portType.kind === 'generic'
    ) {
      return true; // No type constraint or wildcard — allow anything
    }

    // Validate that the data's runtime type is compatible
    const dataType = inferType(data);
    if (!isCompatible(dataType, portType)) {
      this.#logs.warn('Input validation failed, dropping data', {
        workflowId: this.#workflow.id,
        blockId,
        port: portId,
        expected: portType.kind,
        actual: dataType.kind,
      });
      this.#emit({
        type: 'block.error',
        workflowId: this.#workflow.id,
        blockId,
        port: portId,
        error: `Input validation failed on port "${portId}": expected ${portType.kind}, got ${dataType.kind}`,
        correlationId,
      });
      return false;
    }

    return true;
  }

  /** Build a cache of blockId → (block, blockDef) for O(1) validation lookups. */
  #buildBlockDefCache(workflow: Workflow): void {
    for (const block of workflow.blocks) {
      const resolvedType = this.#resolveBlockType(block.type);
      const def = this.#blocks.get(resolvedType);
      this.#blockDefCache.set(block.id, def ? { block, def } : null);
    }
  }

  #emit(event: ExecutionEvent): void {
    // Any activity inside a run defers its quiescence close (run.closed itself
    // must not re-arm the timer, or a run would never close).
    if (event.correlationId && event.type !== 'run.closed') {
      this.#touchRun(event.workflowId, event.correlationId);
    }

    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (e) {
        this.#logs.error('Execution listener threw', {}, { error: e });
      }
    }
  }

  /** Mark the run roots: block instances that are not the target of any connection. */
  #computeSourceInstances(workflow: Workflow): void {
    this.#sourceInstances.clear();
    const hasInbound = new Set<string>();
    for (const conn of workflow.connections) {
      hasInbound.add(conn.to);
    }
    for (const block of workflow.blocks) {
      if (!hasInbound.has(block.id)) {
        this.#sourceInstances.add(block.id);
      }
    }
  }

  /** (Re)arm the quiescence timer that closes a run after a window of inactivity. */
  #touchRun(workflowId: string, correlationId: string): void {
    const existing = this.#openRuns.get(correlationId);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(
      () => this.#closeRun(workflowId, correlationId),
      WorkflowExecutor.#QUIESCENCE_MS
    );
    this.#openRuns.set(correlationId, timer);
  }

  /** Close a run: drop its timer + per-block correlation, then emit run.closed. */
  #closeRun(workflowId: string, correlationId: string): void {
    const timer = this.#openRuns.get(correlationId);
    if (timer) {
      clearTimeout(timer);
    }
    this.#openRuns.delete(correlationId);
    for (const [instanceId, cid] of this.#lastCorrelationId) {
      if (cid === correlationId) {
        this.#lastCorrelationId.delete(instanceId);
      }
    }
    this.#emit({ type: 'run.closed', workflowId, correlationId });
  }

  /** Resolve a block type - uses registry's O(1) short-name index. */
  #resolveBlockType(type: string): string {
    return this.#blocks.resolve(type);
  }
}
