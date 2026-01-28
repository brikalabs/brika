/**
 * Event Bus
 *
 * Central router for workflow events.
 * Routes events between blocks, buffers last values, and streams to UI.
 */

import type { Serializable } from '../serialization';
import { serialize } from '../serialization';
import type { BlockConfig, PortRef, Workflow } from '../types';
import { parsePortRef } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Event Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A workflow event representing data flowing through a port.
 */
export interface WorkflowEvent {
  /** Unique event ID */
  id: string;

  /** Timestamp (Unix ms) */
  ts: number;

  /** Workflow ID */
  workflowId: string;

  /** Source block instance ID */
  sourceBlockId: string;

  /** Source output port ID */
  sourcePort: string;

  /** Event data */
  data: Serializable;
}

/**
 * Dispatched event with target information.
 */
export interface DispatchedEvent extends WorkflowEvent {
  /** Target block instance ID */
  targetBlockId: string;

  /** Target input port ID */
  targetPort: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Port Buffer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buffer holding the last value for a port.
 * Useful for UI inspection and retrigger.
 */
export interface PortBuffer {
  /** Port identifier "blockId:portId" */
  portRef: string;

  /** Last value */
  value: Serializable;

  /** When it was set */
  timestamp: number;

  /** Event count */
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler for dispatched events.
 */
export type EventHandler = (
  targetBlockId: string,
  targetPort: string,
  data: Serializable,
  event: DispatchedEvent
) => void | Promise<void>;

/**
 * Observer for all events (for UI streaming).
 */
export type EventObserver = (event: DispatchedEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Event Bus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central event router for a workflow.
 */
export class EventBus {
  readonly #workflowId: string;
  readonly #connections: Map<string, PortRef | undefined>; // "blockId:portId" -> target
  readonly #handler: EventHandler;
  readonly #observers = new Set<EventObserver>();

  /** Last value buffer for each port */
  readonly #buffers = new Map<string, PortBuffer>();

  constructor(workflow: Workflow, handler: EventHandler) {
    this.#workflowId = workflow.workspace.id;
    this.#handler = handler;
    this.#connections = this.#buildConnectionMap(workflow.blocks);
  }

  #buildConnectionMap(blocks: BlockConfig[]): Map<string, PortRef | undefined> {
    const map = new Map<string, PortRef | undefined>();
    for (const block of blocks) {
      for (const [portId, target] of Object.entries(block.outputs)) {
        const key = `${block.id}:${portId}`;
        map.set(key, target);
      }
    }
    return map;
  }

  /**
   * Emit data from a block's output port.
   */
  async emit(sourceBlockId: string, sourcePort: string, data: Serializable): Promise<void> {
    const event: WorkflowEvent = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      workflowId: this.#workflowId,
      sourceBlockId,
      sourcePort,
      data,
    };

    // Update port buffer
    const portKey = `${sourceBlockId}:${sourcePort}`;
    const existing = this.#buffers.get(portKey);
    this.#buffers.set(portKey, {
      portRef: portKey,
      value: data,
      timestamp: event.ts,
      count: (existing?.count ?? 0) + 1,
    });

    // Get target for this output port
    const targetRef = this.#connections.get(portKey);

    // Dispatch to target if it exists
    if (targetRef) {
      const { blockId: targetBlockId, portId: targetPort } = parsePortRef(targetRef);

      const dispatched: DispatchedEvent = {
        ...event,
        targetBlockId,
        targetPort,
      };

      // Notify observers (for UI)
      for (const observer of this.#observers) {
        observer(dispatched);
      }

      // Dispatch to handler
      await this.#handler(targetBlockId, targetPort, data, dispatched);
    }
  }

  /**
   * Get the last value for a port (for UI inspection).
   */
  getPortBuffer(blockId: string, portId: string): PortBuffer | undefined {
    return this.#buffers.get(`${blockId}:${portId}`);
  }

  /**
   * Get all port buffers (for UI state display).
   */
  getAllBuffers(): PortBuffer[] {
    return [...this.#buffers.values()];
  }

  /**
   * Retrigger the last value from a port.
   * Useful for debugging - resend the last data through the flow.
   */
  async retrigger(blockId: string, portId: string): Promise<boolean> {
    const buffer = this.#buffers.get(`${blockId}:${portId}`);
    if (!buffer) return false;

    await this.emit(blockId, portId, buffer.value);
    return true;
  }

  /**
   * Inject data into a port (for testing/debugging).
   */
  async inject(blockId: string, portId: string, data: Serializable): Promise<void> {
    await this.emit(blockId, portId, data);
  }

  /**
   * Subscribe to all events (for UI streaming).
   */
  observe(observer: EventObserver): () => void {
    this.#observers.add(observer);
    return () => this.#observers.delete(observer);
  }

  /**
   * Get connection count.
   */
  get connectionCount(): number {
    let count = 0;
    for (const target of this.#connections.values()) {
      if (target !== undefined) count++;
    }
    return count;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE Event Stream
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an SSE-compatible event stream from the event bus.
 */
export function createEventStream(eventBus: EventBus): ReadableStream<string> {
  let unsubscribe: (() => void) | undefined;

  return new ReadableStream({
    start(controller) {
      unsubscribe = eventBus.observe(async (event) => {
        const data = await serialize(event);
        controller.enqueue(`data: ${data}\n\n`);
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });
}
