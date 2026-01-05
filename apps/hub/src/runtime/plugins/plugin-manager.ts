import type { Json } from '@brika/ipc';
import type { BlockContext, BlockResult, ToolCallContext, ToolResult } from '@brika/ipc/contract';
import type { Plugin } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { StateStore } from '@/runtime/state/state-store';
import { PluginLifecycle } from './plugin-lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// PluginManager - Public API for plugin operations
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class PluginManager {
  readonly #lifecycle = inject(PluginLifecycle);
  readonly #state = inject(StateStore);
  readonly #events = inject(EventSystem);
  readonly #blocks = inject(BlockRegistry);

  // ─────────────────────────────────────────────────────────────────────────
  // Query API
  // ─────────────────────────────────────────────────────────────────────────

  get(uid: string): Plugin | null {
    // Try to find by UID in running processes
    const process = this.#lifecycle.getProcessByUid(uid);
    if (process) {
      return this.#lifecycle.toPlugin(process);
    }

    // Not found in running processes, get stored state
    const stored = this.#state.getByUidWithMetadata(uid);
    if (!stored) {
      return null;
    }

    // fromStored will check for process by ref and return stored data if not found
    return this.#lifecycle.fromStored(stored);
  }

  list(): Plugin[] {
    const out: Plugin[] = [];
    const seenNames = new Set<string>();

    for (const process of this.#lifecycle.listProcesses()) {
      seenNames.add(process.name);
      out.push(this.#lifecycle.toPlugin(process));
    }

    for (const stored of this.#state.listInstalledWithMetadata()) {
      if (!seenNames.has(stored.name)) {
        out.push(this.#lifecycle.fromStored(stored));
      }
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  resolve(name: string): string | null {
    const process = this.#lifecycle.getProcessByName(name);
    if (process) return process.uid;

    const stored = this.#state.get(name);
    return stored?.uid ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle Operations
  // ─────────────────────────────────────────────────────────────────────────

  async enable(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) throw new Error(`Plugin not found: ${uid}`);

    await this.#state.setEnabled(name, true);
    const stored = this.#state.get(name);
    if (!stored) throw new Error(`Plugin state not found: ${name}`);

    await this.#lifecycle.load(stored.rootDirectory);
  }

  async disable(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) throw new Error(`Plugin not found: ${uid}`);

    await this.#state.setEnabled(name, false);
    await this.#lifecycle.unload(name);
  }

  async reload(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) throw new Error(`Plugin not found: ${uid}`);

    // Unload the plugin first
    await this.#lifecycle.unload(name);

    // Verify process is actually gone
    if (this.#lifecycle.hasProcessByName(name)) {
      throw new Error(`Plugin ${uid} is still running after unload`);
    }

    // Set up event listener AFTER unloading to catch the new loaded event
    const loadedPromise = this.#events.waitFor(
      PluginActions.loaded,
      (action) => action.payload.uid === uid,
      { timeout: 30000 }
    );

    // Get stored state to know the root directory
    const stored = this.#state.get(name);
    if (!stored) throw new Error(`Plugin state not found: ${name}`);

    // Load the plugin (no need for force since we already unloaded)
    try {
      await this.#lifecycle.load(stored.rootDirectory);
    } catch (error) {
      throw new Error(
        `Failed to load plugin ${uid}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Verify process was actually created
    if (!this.#lifecycle.hasProcessByName(name)) {
      throw new Error(`Plugin ${uid} failed to start after load`);
    }

    // Wait for the plugin to be ready
    let action;
    try {
      action = await loadedPromise;
    } catch (error) {
      // If timeout, unload the plugin that failed to start
      await this.#lifecycle.unload(name);
      throw new Error(
        `Plugin ${uid} failed to become ready within timeout: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    await this.#events.dispatch(
      PluginActions.reloaded.create({ uid: action.payload.uid, name: action.payload.name }, 'hub')
    );
  }

  async kill(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) throw new Error(`Plugin not found: ${uid}`);

    const process = this.#lifecycle.getProcessByName(name);
    if (!process) return;

    process.kill(9);
    await this.#state.setHealth(name, 'crashed', 'killed');
    await this.#lifecycle.unload(name);
  }

  async load(nameOrPath: string): Promise<void> {
    return this.#lifecycle.load(nameOrPath);
  }

  async unload(name: string, skipRestartReset = false): Promise<void> {
    return this.#lifecycle.unload(name, skipRestartReset);
  }

  async stopAll(): Promise<void> {
    return this.#lifecycle.stopAll();
  }

  async restoreEnabledFromState(): Promise<void> {
    return this.#lifecycle.restoreEnabled();
  }

  async cleanupStaleState(): Promise<void> {
    return this.#lifecycle.cleanupStale();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tool & Block Execution
  // ─────────────────────────────────────────────────────────────────────────

  async callTool(
    name: string,
    toolName: string,
    args: Record<string, Json>,
    ctx: ToolCallContext
  ): Promise<ToolResult> {
    const process = this.#lifecycle.getProcessByName(name);
    if (!process) return { ok: false, content: `Plugin not loaded: ${name}` };
    return process.callTool(toolName, args, ctx);
  }

  async executeBlock(
    blockType: string,
    config: Record<string, Json>,
    context: BlockContext
  ): Promise<BlockResult> {
    const pluginName = this.#blocks.getProvider(blockType);
    if (!pluginName) return { error: `Unknown block type: ${blockType}`, stop: true };

    const process = this.#lifecycle.getProcessByName(pluginName);
    if (!process) return { error: `Plugin not loaded: ${pluginName}`, stop: true };

    const localBlockId = blockType.includes(':') ? blockType.split(':')[1] : blockType;
    return process.executeBlock(localBlockId, config, context);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  #getName(uid: string): string | null {
    const process = this.#lifecycle.getProcessByUid(uid);
    if (process) return process.name;

    const stored = this.#state.getByUid(uid);
    return stored?.name ?? null;
  }
}
