/**
 * Workflow Types and Executor
 */

import type { Json } from "../types";
import type { Block, BlockContext, BlockRuntime } from "./block";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowTrigger {
  event: string;
  filter?: Record<string, Json>;
}

export interface WorkflowBlock {
  id: string;
  type: string;
  [key: string]: Json;
}

export interface Workflow {
  id: string;
  name: string;
  enabled?: boolean;
  trigger: WorkflowTrigger;
  blocks: WorkflowBlock[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowExecutorOptions {
  /** Block registry - type → block */
  blocks: Map<string, Block>;
  /** Call a tool */
  callTool: (name: string, args: Record<string, Json>) => Promise<Json>;
  /** Emit an event */
  emit: (type: string, payload: Json) => void;
  /** Log a message */
  log: (level: "debug" | "info" | "warn" | "error", message: string) => void;
  /** Subscribe to events */
  subscribe: (pattern: string, handler: (e: { type: string; payload: Json }) => void) => () => void;
}

export class WorkflowExecutor {
  private blocks: Map<string, Block>;
  private runtime: BlockRuntime;

  constructor(private opts: WorkflowExecutorOptions) {
    this.blocks = opts.blocks;
    this.runtime = {
      callTool: opts.callTool,
      emit: opts.emit,
      log: opts.log,
      subscribe: opts.subscribe,
      runBlock: async () => {
        /* set per-workflow */
      },
    };
  }

  async run(workflow: Workflow, event: { type: string; payload: Json; source: string }): Promise<void> {
    const blockMap = new Map(workflow.blocks.map((b) => [b.id, b]));

    const ctx: BlockContext = {
      trigger: { type: event.type, payload: event.payload, source: event.source, ts: Date.now() },
      vars: {},
      prev: null,
    };

    // Set runBlock for this execution
    const runtime: BlockRuntime = {
      ...this.runtime,
      runBlock: async (id) => {
        await this.runBlock(id, blockMap, ctx, runtime);
      },
    };

    // Start with first block
    const firstBlock = workflow.blocks[0];
    if (!firstBlock) return;

    await this.runBlock(firstBlock.id, blockMap, ctx, runtime);
  }

  private async runBlock(
    id: string,
    blockMap: Map<string, WorkflowBlock>,
    ctx: BlockContext,
    runtime: BlockRuntime,
  ): Promise<void> {
    const config = blockMap.get(id);
    if (!config) {
      this.opts.log("error", `Block not found: ${id}`);
      return;
    }

    const block = this.blocks.get(config.type);
    if (!block) {
      this.opts.log("error", `Unknown block type: ${config.type}`);
      return;
    }

    // Validate config
    const parsed = block.schema.safeParse(config);
    if (!parsed.success) {
      this.opts.log("error", `Block ${id} validation failed: ${parsed.error.message}`);
      return;
    }

    // Execute
    const result = await block.execute(parsed.data, ctx, runtime);

    // Update prev
    if (result.output !== undefined) {
      ctx.prev = result.output;
    }

    // Stop or continue
    if (result.stop) return;
    if (result.next) {
      await this.runBlock(result.next, blockMap, ctx, runtime);
    }
  }
}

