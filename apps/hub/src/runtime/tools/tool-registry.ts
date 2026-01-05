import type {
  Json,
  ToolCallContext,
  ToolInputSchema,
  ToolResult,
  ToolSummary,
} from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { LogRouter } from '@/runtime/logs/log-router';

export interface Tool {
  /** Local ID (without plugin prefix) */
  id: string;
  /** Full qualified name with plugin prefix (pluginId:toolId) */
  name: string;
  description?: string;
  /** Lucide icon name (e.g., "timer", "wrench") */
  icon?: string;
  /** Color for UI display (e.g., "#d97706") */
  color?: string;
  owner: string;
  inputSchema?: ToolInputSchema;
}

export type ToolCaller = (
  owner: string,
  toolId: string,
  args: Record<string, Json>,
  ctx: ToolCallContext
) => Promise<ToolResult>;

@singleton()
export class ToolRegistry {
  private readonly logs = inject(LogRouter);
  readonly #tools = new Map<string, Tool>();
  #caller: ToolCaller | null = null;

  /**
   * Set the tool caller function
   */
  setToolCaller(caller: ToolCaller): void {
    this.#caller = caller;
  }

  /**
   * Register a tool from a plugin
   * The full name will be `pluginId:toolId` (e.g., "timer:set")
   */
  register(
    id: string,
    owner: string,
    tool: { description?: string; icon?: string; color?: string; inputSchema?: ToolInputSchema }
  ): void {
    // Create full qualified name: pluginId:toolId
    const name = `${owner}:${id}`;

    if (this.#tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }

    this.#tools.set(name, { ...tool, id, name, owner });
    this.logs.info('tool.register', { name, id, owner });
  }

  unregister(name: string): void {
    const t = this.#tools.get(name);
    if (!t) return;
    this.#tools.delete(name);
    this.logs.info('tool.unregister', { name, owner: t.owner });
  }

  get(name: string): Tool | undefined {
    return this.#tools.get(name);
  }

  list(): ToolSummary[] {
    return [...this.#tools.values()]
      .map((t) => ({
        id: t.name,
        description: t.description,
        icon: t.icon,
        color: t.color,
        inputSchema: t.inputSchema,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  listByOwner(owner: string): ToolSummary[] {
    return [...this.#tools.values()]
      .filter((t) => t.owner === owner)
      .map((t) => ({
        id: t.name,
        description: t.description,
        icon: t.icon,
        color: t.color,
        inputSchema: t.inputSchema,
      }));
  }

  call(name: string, args: Record<string, Json>, ctx: ToolCallContext): Promise<ToolResult> {
    const t = this.#tools.get(name);
    if (!t) return Promise.resolve({ ok: false, content: `Unknown tool: ${name}` });
    if (!this.#caller) return Promise.resolve({ ok: false, content: 'Tool caller not configured' });
    return this.#caller(t.owner, t.id, args, ctx);
  }

  unregisterByOwner(owner: string): void {
    for (const t of this.#tools.values()) {
      if (t.owner === owner) this.unregister(t.name);
    }
  }
}
