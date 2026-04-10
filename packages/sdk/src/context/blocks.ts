/**
 * Blocks Module
 *
 * Handles block registration and reactive block lifecycle (start, pushInput, stop).
 * Self-registers with the context module system.
 */

import type { Json } from '@brika/ipc';
import { blockEmit, pushInput, registerBlock, startBlock, stopBlock } from '@brika/ipc/contract';
import type { Serializable } from '@brika/serializable';
import type { BlockInstance, CompiledReactiveBlock } from '../blocks/reactive-define';
import type { BlockDefinition } from '../blocks/types';
import { type ContextCore, registerContextModule } from './register';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupBlocks(core: ContextCore) {
  const { client, manifest } = core;
  const declaredBlocks = new Set(manifest.blocks?.map((b) => b.id) ?? []);
  const blockMeta = new Map(manifest.blocks?.map((b) => [b.id, b]));
  const blocks = new Set<string>();
  const reactiveBlocks = new Map<string, CompiledReactiveBlock>();
  const blockInstances = new Map<string, BlockInstance>();

  client.implement(startBlock, ({ blockType, instanceId, workflowId, config }) => {
    const colonIndex = blockType.indexOf(':');
    const localBlockId = colonIndex >= 0 ? blockType.slice(colonIndex + 1) : blockType;
    const block = reactiveBlocks.get(localBlockId);

    if (!block) {
      return {
        ok: false,
        error: `Block not found: ${localBlockId}`,
      };
    }

    if (blockInstances.has(instanceId)) {
      return {
        ok: false,
        error: `Block instance already exists: ${instanceId}`,
      };
    }

    try {
      const instance = block.start({
        blockId: instanceId,
        workflowId,
        config,
        emit: (port, data) => {
          client.send(blockEmit, {
            instanceId,
            port,
            data: data as Json,
          });
        },
      });

      blockInstances.set(instanceId, instance);
      return {
        ok: true,
      };
    } catch (e) {
      return {
        ok: false,
        error: String(e),
      };
    }
  });

  client.on(pushInput, ({ instanceId, port, data }) => {
    const instance = blockInstances.get(instanceId);
    if (instance) {
      instance.pushInput(port, data as Serializable);
    }
  });

  client.on(stopBlock, ({ instanceId }) => {
    const instance = blockInstances.get(instanceId);
    if (instance) {
      instance.stop();
      blockInstances.delete(instanceId);
    }
  });

  return {
    methods: {
      registerBlock(
        block: BlockDefinition & {
          start?: CompiledReactiveBlock['start'];
        }
      ): {
        id: string;
      } {
        const { id } = block;
        if (!declaredBlocks.has(id)) {
          throw new Error(
            `Block "${id}" not in package.json. Add: "blocks": [{"id": "${id}", "name": "...", "category": "..."}]`
          );
        }
        if (blocks.has(id)) {
          throw new Error(`Block "${id}" already registered`);
        }

        const meta = blockMeta.get(id);
        if (!meta) {
          throw new Error(`Block "${id}" metadata not found in package.json`);
        }

        blocks.add(id);

        if (block.start) {
          reactiveBlocks.set(id, block as CompiledReactiveBlock);
        }

        const mapPort = (p: (typeof block.inputs)[number]) => ({
          id: p.id,
          name: p.id,
          typeName: p.typeName,
          type: p.type,
          jsonSchema: p.jsonSchema,
        });

        client.send(registerBlock, {
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
        return {
          id,
        };
      },
    },

    stop() {
      for (const instance of blockInstances.values()) {
        instance.stop();
      }
      blockInstances.clear();
    },
  };
}

registerContextModule('blocks', setupBlocks);
