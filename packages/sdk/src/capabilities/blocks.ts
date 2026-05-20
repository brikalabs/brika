/**
 * Blocks capability specs.
 *
 * Three permission-gated capabilities that model the *plugin -> hub* direction
 * of the reactive blocks surface:
 *
 *   - `blocks.register`: plugin announces a block definition (declared in
 *     its manifest) so the hub can list/instantiate it from workflows.
 *   - `blocks.emit`:     plugin emits a value from a running instance's
 *     output port back to the hub for downstream wiring.
 *   - `blocks.log`:      plugin streams a structured log line scoped to a
 *     running instance (and its workflow) into the hub's log pipeline.
 *
 * The *hub -> plugin* direction — `startBlock`, `stopBlock`, `pushInput` —
 * stays on the legacy IPC channel (see `@brika/ipc/contract/blocks`).
 * Capabilities only model plugin-initiated calls; the lifecycle RPCs that
 * the hub drives against a running plugin instance are not capabilities.
 *
 * The handlers live in `apps/hub/src/runtime/plugins/capabilities/blocks.ts`;
 * this file defines only the specs (so they can be imported from both sides)
 * and the Ctx augmentation (so plugin types see `ctx.blocks.{register,emit,log}`).
 */

import { defineCapability } from '@brika/capabilities';
import { Json } from '@brika/ipc';
import { BlockDefinition } from '@brika/ipc/contract';
import { z } from 'zod';

const BLOCKS_PERMISSION = {
  name: 'blocks',
  scope: z.object({}),
  defaultScope: {},
  icon: 'box',
} as const;

/** Plugin announces a block definition to the hub. */
export const blocksRegister = defineCapability(
  {
    id: 'dev.brika.blocks.register',
    ctxPath: 'blocks.register',
    args: z.object({ block: BlockDefinition }),
    result: z.object({}),
    description: 'Register a reactive block definition with the hub',
    permission: BLOCKS_PERMISSION,
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'blocks.register handler is not registered. The hub must register a handler before plugin code can call ctx.blocks.register().'
    );
  }
);

/** Plugin emits a value from a running instance's output port. */
export const blocksEmit = defineCapability(
  {
    id: 'dev.brika.blocks.emit',
    ctxPath: 'blocks.emit',
    args: z.object({
      instanceId: z.string(),
      port: z.string(),
      data: Json,
    }),
    result: z.object({}),
    description: "Emit a value from a block instance's output port",
    permission: BLOCKS_PERMISSION,
  },
  () => {
    throw new Error(
      'blocks.emit handler is not registered. The hub must register a handler before plugin code can call ctx.blocks.emit().'
    );
  }
);

/** Plugin streams a structured log line scoped to a running instance. */
export const blocksLog = defineCapability(
  {
    id: 'dev.brika.blocks.log',
    ctxPath: 'blocks.log',
    args: z.object({
      instanceId: z.string(),
      workflowId: z.string(),
      level: z.enum(['debug', 'info', 'warn', 'error']),
      message: z.string(),
    }),
    result: z.object({}),
    description: 'Emit a structured log line from a running block instance',
    permission: BLOCKS_PERMISSION,
  },
  () => {
    throw new Error(
      'blocks.log handler is not registered. The hub must register a handler before plugin code can call ctx.blocks.log().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    blocks: {
      /**
       * Register a reactive block definition with the hub. The block's `id`
       * must match a `blocks[].id` entry in `package.json`.
       *
       * Requires the `blocks` permission. Throws `PermissionDeniedError`
       * at the SDK boundary if the user has not granted it.
       */
      register(args: { block: z.infer<typeof BlockDefinition> }): Promise<Record<string, never>>;

      /**
       * Emit a value from a running block instance's output port. The hub
       * forwards it to downstream nodes wired to that port.
       *
       * Requires the `blocks` permission.
       */
      emit(args: {
        instanceId: string;
        port: string;
        data: z.infer<typeof Json>;
      }): Promise<Record<string, never>>;

      /**
       * Stream a structured log line scoped to a running block instance and
       * its owning workflow into the hub's log pipeline.
       *
       * Requires the `blocks` permission.
       */
      log(args: {
        instanceId: string;
        workflowId: string;
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
      }): Promise<Record<string, never>>;
    };
  }
}
