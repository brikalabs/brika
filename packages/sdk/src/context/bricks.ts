/**
 * Bricks Module
 *
 * Thin typed wrapper over the prelude's brick system.
 * Manifest validation lives in the prelude.
 * Self-registers with the context module system.
 */

import { type ContextCore, registerContextModule, requireBridge } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrickConfigChangeHandler = (
  instanceId: string,
  config: Record<string, unknown>
) => void;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupBricks(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      registerBrickType(spec: {
        id: string;
        families: ReadonlyArray<'sm' | 'md' | 'lg'>;
        minSize?: { w: number; h: number };
        maxSize?: { w: number; h: number };
        config?: unknown[];
      }): void {
        bridge.registerBrickType(spec);
      },

      setBrickData(brickTypeId: string, data: unknown): void {
        bridge.setBrickData(brickTypeId, data);
      },

      onBrickConfigChange(handler: BrickConfigChangeHandler): () => void {
        return bridge.onBrickConfigChange(handler);
      },
    },
  };
}

registerContextModule('bricks', setupBricks);
