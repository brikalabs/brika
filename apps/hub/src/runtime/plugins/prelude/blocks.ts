/**
 * Prelude Blocks Module
 *
 * Block registration (with manifest validation), instance lifecycle
 * (start/pushInput/stop RPCs), brick data push, and config change dispatch.
 *
 * Uses structural types instead of importing @brika/flow - the prelude
 * runs from the hub's directory and doesn't have flow in its resolution path.
 * The actual block implementations live in the plugin (SDK side) and are
 * passed in as opaque callbacks via registerBlock().
 */

import type { Channel, Json } from '@brika/ipc';
import type { LogLevelType } from '@brika/ipc/contract';
import {
  blockEmit,
  pushInput as pushInputMsg,
  registerBlock as registerBlockMsg,
  startBlock as startBlockRpc,
  stopBlock as stopBlockMsg,
} from '@brika/ipc/contract';

// ---- Structural types (no @brika/flow import needed) ----

interface BlockRuntimeContext {
  blockId: string;
  workflowId: string;
  config: Record<string, unknown>;
  emit(portId: string, data: unknown): void;
}

interface BlockInstance {
  pushInput(portId: string, data: unknown): void;
  stop(): void;
}

interface BlockPort {
  id: string;
  typeName: string;
  type?: unknown;
  jsonSchema?: unknown;
}

export interface RegisterBlockSpec {
  id: string;
  inputs: BlockPort[];
  outputs: BlockPort[];
  schema: unknown;
  start?: (ctx: BlockRuntimeContext) => BlockInstance;
}

// ---- Module ----

export function setupBlocks(
  channel: Channel,
  log: (level: LogLevelType, message: string) => void,
  declaredBlocks: ReadonlyMap<
    string,
    {
      id: string;
      name: string;
      description?: string;
      category: string;
      icon?: string;
      color?: string;
    }
  >
) {
  const registered = new Set<string>();
  const reactiveBlocks = new Map<string, (ctx: BlockRuntimeContext) => BlockInstance>();
  const blockInstances = new Map<string, BlockInstance>();

  // ---- RPC: hub asks plugin to start a block instance ----
  channel.implement(startBlockRpc, ({ blockType, instanceId, workflowId, config }) => {
    const colonIndex = blockType.indexOf(':');
    const localBlockId = colonIndex >= 0 ? blockType.slice(colonIndex + 1) : blockType;
    const start = reactiveBlocks.get(localBlockId);

    if (!start) {
      return { ok: false, error: `Block not found: ${localBlockId}` };
    }
    if (blockInstances.has(instanceId)) {
      return { ok: false, error: `Block instance already exists: ${instanceId}` };
    }

    try {
      const instance = start({
        blockId: instanceId,
        workflowId,
        config,
        emit: (port, data) => {
          channel.send(blockEmit, { instanceId, port, data: data as Json });
        },
      });
      blockInstances.set(instanceId, instance);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  // ---- Message: hub pushes data to a block input port ----
  channel.on(pushInputMsg, ({ instanceId, port, data }) => {
    blockInstances.get(instanceId)?.pushInput(port, data);
  });

  // ---- Message: hub asks plugin to stop a block instance ----
  channel.on(stopBlockMsg, ({ instanceId }) => {
    const instance = blockInstances.get(instanceId);
    if (instance) {
      instance.stop();
      blockInstances.delete(instanceId);
    }
  });

  return {
    registerBlock(block: RegisterBlockSpec): { id: string } {
      const { id } = block;

      if (!declaredBlocks.has(id)) {
        throw new Error(
          `Block "${id}" not in package.json. Add: "blocks": [{"id": "${id}", "name": "...", "category": "..."}]`
        );
      }
      if (registered.has(id)) {
        throw new Error(`Block "${id}" already registered`);
      }

      const meta = declaredBlocks.get(id);
      if (!meta) {
        throw new Error(`Block "${id}" metadata not found in package.json`);
      }

      registered.add(id);

      if (block.start) {
        reactiveBlocks.set(id, block.start);
      }

      const mapPort = (p: BlockPort) => ({
        id: p.id,
        name: p.id,
        typeName: p.typeName,
        type: p.type as Json | undefined,
        jsonSchema: p.jsonSchema as Json | undefined,
      });

      channel.send(registerBlockMsg, {
        block: {
          id,
          name: meta.name,
          description: meta.description,
          category: meta.category,
          icon: meta.icon,
          color: meta.color,
          inputs: block.inputs.map(mapPort),
          outputs: block.outputs.map(mapPort),
          schema: block.schema as unknown as Record<string, Json>,
        },
      });

      return { id };
    },

    stopAllInstances(): void {
      for (const instance of blockInstances.values()) {
        instance.stop();
      }
      blockInstances.clear();
    },
  };
}
