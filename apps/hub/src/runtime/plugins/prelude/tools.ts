/**
 * Prelude Tools Module
 *
 * Tool handler registry and callTool RPC implementation. Mirrors the action
 * registry (prelude/actions.ts): a plugin registers a tool + handler; the hub
 * invokes it by id via the callTool RPC. Tools differ from actions only in that
 * the hub indexes them in a global, AI-discoverable registry.
 */

import type { Channel, Json } from '@brika/ipc';
import {
  callTool as callToolRpc,
  registerTool as registerToolMsg,
  type ToolCallContext,
  type ToolDefinition,
  type ToolResult,
} from '@brika/ipc/contract';

type ToolHandler = (args: Record<string, Json>, ctx: ToolCallContext) => Json | Promise<Json>;

export function setupTools(channel: Channel) {
  const handlers = new Map<string, ToolHandler>();

  channel.implement(callToolRpc, async ({ tool, args, ctx }): Promise<ToolResult> => {
    const handler = handlers.get(tool);
    if (!handler) {
      return { ok: false, content: `Tool "${tool}" not found` };
    }
    try {
      const result = await handler(args, ctx);
      // A string is the model-facing `content`; any other JSON is structured `data`.
      if (typeof result === 'string') {
        return { ok: true, content: result };
      }
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, content: e instanceof Error ? e.message : String(e) };
    }
  });

  return {
    registerTool(tool: ToolDefinition, handler: ToolHandler): void {
      handlers.set(tool.id, handler);
      channel.send(registerToolMsg, { tool });
    },
  };
}
