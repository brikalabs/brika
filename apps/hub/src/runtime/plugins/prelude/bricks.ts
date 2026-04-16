/**
 * Prelude Bricks Module
 *
 * Brick type registration (with manifest validation),
 * data push, and config change dispatch.
 */

import type { Channel } from '@brika/ipc';
import type { LogLevelType } from '@brika/ipc/contract';
import {
  pushBrickData as pushBrickDataMsg,
  registerBrickType as registerBrickTypeMsg,
  updateBrickConfig as updateBrickConfigMsg,
} from '@brika/ipc/contract';

type BrickConfigChangeHandler = (instanceId: string, config: Record<string, unknown>) => void;

export function setupBricks(
  channel: Channel,
  log: (level: LogLevelType, message: string) => void,
  declaredBricks: ReadonlySet<string>
) {
  const configChangeHandlers = new Set<BrickConfigChangeHandler>();

  channel.on(updateBrickConfigMsg, ({ instanceId, config }) => {
    for (const handler of configChangeHandlers) {
      try {
        handler(instanceId, config);
      } catch (e) {
        log('error', `Brick config change handler error: ${e}`);
      }
    }
  });

  return {
    registerBrickType(spec: {
      id: string;
      families: ReadonlyArray<'sm' | 'md' | 'lg'>;
      minSize?: { w: number; h: number };
      maxSize?: { w: number; h: number };
      config?: unknown[];
    }): void {
      if (!declaredBricks.has(spec.id)) {
        throw new Error(
          `Brick "${spec.id}" not in package.json. Add: "bricks": [{"id": "${spec.id}"}]`
        );
      }
      channel.send(registerBrickTypeMsg, { brickType: { ...spec, families: [...spec.families] } });
    },

    setBrickData(brickTypeId: string, data: unknown): void {
      if (!declaredBricks.has(brickTypeId)) {
        log('error', `setBrickData: unknown brick type "${brickTypeId}"`);
        return;
      }
      channel.send(pushBrickDataMsg, { brickTypeId, data });
    },

    onBrickConfigChange(handler: BrickConfigChangeHandler): () => void {
      configChangeHandlers.add(handler);
      return () => {
        configChangeHandlers.delete(handler);
      };
    },
  };
}
