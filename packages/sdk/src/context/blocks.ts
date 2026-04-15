/**
 * Blocks Module
 *
 * Thin typed wrapper over the prelude's block system.
 * Manifest validation, instance lifecycle (start/pushInput/stop),
 * and IPC messaging all live in the prelude.
 *
 * Self-registers with the context module system.
 */

import type { CompiledReactiveBlock } from '../blocks/reactive-define';
import type { BlockDefinition } from '../blocks/types';
import { type ContextCore, registerContextModule, requireBridge } from './register';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupBlocks(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      registerBlock(
        block: BlockDefinition & {
          start?: CompiledReactiveBlock['start'];
        }
      ): {
        id: string;
      } {
        return bridge.registerBlock(block);
      },
    },
  };
}

registerContextModule('blocks', setupBlocks);
