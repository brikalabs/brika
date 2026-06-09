/**
 * Tools Module
 *
 * Thin typed wrapper over the prelude's tool handler registry.
 * Self-registers with the context module system.
 */

import type { ToolDefinition, ToolHandler } from '../api/tools';
import { type ContextCore, registerContextModule, requireBridge } from './register';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupTools(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      registerTool(tool: ToolDefinition, handler: ToolHandler): void {
        bridge.registerTool(tool, handler);
      },
    },
  };
}

registerContextModule('tools', setupTools);
