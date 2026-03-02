/**
 * Bricks Module
 *
 * Handles brick type registration, data push, and per-instance config
 * change notifications for client-rendered bricks.
 * Self-registers with the context module system.
 */

import {
  pushBrickData as pushBrickDataMsg,
  registerBrickType as registerBrickTypeMsg,
  updateBrickConfig as updateBrickConfigMsg,
} from '@brika/ipc/contract';
import { type ContextCore, registerContextModule } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrickConfigChangeHandler = (
  instanceId: string,
  config: Record<string, unknown>
) => void;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupBricks(core: ContextCore) {
  const { client, manifest } = core;
  const declaredBricks = new Set(manifest.bricks?.map((c) => c.id) ?? []);
  const configChangeHandlers = new Set<BrickConfigChangeHandler>();

  // Listen for per-instance config updates from the hub
  client.on(updateBrickConfigMsg, ({ instanceId, config }) => {
    for (const handler of configChangeHandlers) {
      try {
        handler(instanceId, config);
      } catch (e) {
        core.log('error', `Brick config change handler error: ${e}`);
      }
    }
  });

  return {
    methods: {
      registerBrickType(spec: {
        id: string;
        families: ('sm' | 'md' | 'lg')[];
        minSize?: { w: number; h: number };
        maxSize?: { w: number; h: number };
        config?: unknown[];
      }): void {
        if (!declaredBricks.has(spec.id)) {
          throw new Error(
            `Brick "${spec.id}" not in package.json. Add: "bricks": [{"id": "${spec.id}"}]`
          );
        }

        client.send(registerBrickTypeMsg, {
          brickType: {
            id: spec.id,
            families: spec.families,
            minSize: spec.minSize,
            maxSize: spec.maxSize,
            config: spec.config,
          },
        });
      },

      setBrickData(brickTypeId: string, data: unknown): void {
        if (!declaredBricks.has(brickTypeId)) {
          core.log('error', `setBrickData: unknown brick type "${brickTypeId}"`);
          return;
        }
        client.send(pushBrickDataMsg, { brickTypeId, data });
      },

      onBrickConfigChange(handler: BrickConfigChangeHandler): () => void {
        configChangeHandlers.add(handler);
        return () => configChangeHandlers.delete(handler);
      },
    },

    stop() {
      configChangeHandlers.clear();
    },
  };
}

registerContextModule('bricks', setupBricks);
