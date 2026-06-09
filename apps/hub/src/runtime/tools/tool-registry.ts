import { singleton } from '@brika/di';
import type { Json } from '@brika/ipc';
import type { ToolCallContext, ToolDefinition, ToolResult } from '@brika/ipc/contract';

/** Dispatch a call to the owning plugin. Provided by the plugin lifecycle. */
export type ToolInvoke = (args: Record<string, Json>, ctx: ToolCallContext) => Promise<ToolResult>;

interface RegisteredTool {
  pluginName: string;
  definition: ToolDefinition;
  invoke: ToolInvoke;
}

/**
 * Global registry of plugin-provided tools, addressed by id across all plugins.
 *
 * This is the cross-plugin action layer: any plugin registers a tool, and an
 * agent / voice assistant / rule / the API can enumerate and invoke it by id
 * without knowing which plugin owns it (unlike `actions`, which are addressed
 * per plugin uid). Decoupled from `PluginProcess` via an `invoke` closure the
 * lifecycle supplies at registration time.
 */
@singleton()
export class ToolRegistry {
  readonly #tools = new Map<string, RegisteredTool>();

  register(pluginName: string, definition: ToolDefinition, invoke: ToolInvoke): void {
    // Qualify the id with the owning plugin (like block types: "pluginId:toolId")
    // so two plugins can each ship a "send" tool without colliding. Callers
    // address the tool by this qualified id.
    const id = `${pluginName}:${definition.id}`;
    this.#tools.set(id, { pluginName, definition: { ...definition, id }, invoke });
  }

  /** Drop every tool a plugin registered (on stop / disconnect / reload). */
  unregisterPlugin(pluginName: string): void {
    for (const [id, entry] of this.#tools) {
      if (entry.pluginName === pluginName) {
        this.#tools.delete(id);
      }
    }
  }

  list(): ToolDefinition[] {
    return [...this.#tools.values()].map((entry) => entry.definition);
  }

  get(id: string): ToolDefinition | undefined {
    return this.#tools.get(id)?.definition;
  }

  async call(id: string, args: Record<string, Json>, ctx: ToolCallContext): Promise<ToolResult> {
    const entry = this.#tools.get(id);
    if (!entry) {
      return { ok: false, content: `Tool "${id}" not found` };
    }
    return await entry.invoke(args, ctx);
  }
}
