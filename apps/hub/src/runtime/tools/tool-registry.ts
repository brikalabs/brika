import { singleton, inject } from "@elia/shared";
import type { Json, ToolCallContext, ToolResult, ToolSummary, ToolInputSchema } from "@elia/shared";
import { LogRouter } from "../logs/log-router";

export interface Tool {
  /** Local ID (without plugin prefix) */
  id: string;
  /** Full qualified name with plugin prefix (pluginId:toolId) */
  name: string;
  description?: string;
  owner: string;
  inputSchema?: ToolInputSchema;
  call(args: Record<string, Json>, ctx: ToolCallContext): Promise<ToolResult>;
}

@singleton()
export class ToolRegistry {
  private readonly logs = inject(LogRouter);
  #tools = new Map<string, Tool>();

  /**
   * Register a tool from a plugin
   * The full name will be `pluginId:toolId` (e.g., "timer:set")
   */
  register(id: string, owner: string, tool: Omit<Tool, "id" | "name" | "owner">): void {
    // Create full qualified name: pluginId:toolId
    const name = `${owner}:${id}`;
    
    if (this.#tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    
    this.#tools.set(name, { ...tool, id, name, owner });
    this.logs.info("tool.register", { name, id, owner });
  }

  unregister(name: string): void {
    const t = this.#tools.get(name);
    if (!t) return;
    this.#tools.delete(name);
    this.logs.info("tool.unregister", { name, owner: t.owner });
  }

  get(name: string): Tool | undefined {
    return this.#tools.get(name);
  }

  list(): ToolSummary[] {
    return [...this.#tools.values()].map(t => ({ 
      name: t.name, 
      description: t.description, 
      owner: t.owner, 
      inputSchema: t.inputSchema 
    }));
  }

  async call(name: string, args: Record<string, Json>, ctx: ToolCallContext): Promise<ToolResult> {
    const t = this.#tools.get(name);
    if (!t) return { ok: false, content: `Unknown tool: ${name}` };
    return t.call(args, ctx);
  }

  unregisterByOwner(owner: string): void {
    for (const t of [...this.#tools.values()]) {
      if (t.owner === owner) this.unregister(t.name);
    }
  }
}
