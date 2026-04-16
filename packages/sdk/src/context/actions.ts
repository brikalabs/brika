/**
 * Actions Module
 *
 * Thin typed wrapper over the prelude's action handler registry.
 * Self-registers with the context module system.
 */

import type { Json } from '../types';
import { type ContextCore, registerContextModule, requireBridge } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionHandler = (input?: Json) => Json | Promise<Json>;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupActions(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      registerAction(id: string, handler: ActionHandler): void {
        bridge.registerAction(id, handler);
      },
    },
  };
}

registerContextModule('actions', setupActions);
