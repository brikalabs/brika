import type { Json } from '@elia/ipc';
import type { BlockContext, BlockResult, ToolCallContext, ToolResult } from '@elia/ipc/contract';
import type { Plugin } from '@elia/shared';
import { inject, singleton } from '@elia/shared';
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
    const seenRefs = new Set<string>();

    for (const process of this.#lifecycle.listProcesses()) {
      seenRefs.add(process.ref);
      out.push(this.#lifecycle.toPlugin(process));
    }

    for (const stored of this.#state.listInstalledWithMetadata()) {
      if (!seenRefs.has(stored.ref)) {
        out.push(this.#lifecycle.fromStored(stored));
      }
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  resolve(ref: string): string | null {
    const process = this.#lifecycle.getProcess(ref);
    if (process) return process.uid;

    const stored = this.#state.get(ref);
    return stored?.uid ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle Operations
  // ─────────────────────────────────────────────────────────────────────────

  async enable(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);

    await this.#state.setEnabled(ref, true);
    await this.#lifecycle.load(ref);
  }

  async disable(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);

    await this.#state.setEnabled(ref, false);
    await this.#lifecycle.unload(ref);
  }

  async reload(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);

    // Unload the plugin first
    await this.#lifecycle.unload(ref);
    
    // Verify process is actually gone
    if (this.#lifecycle.hasProcess(ref)) {
      throw new Error(`Plugin ${uid} is still running after unload`);
    }

    // Set up event listener AFTER unloading to catch the new loaded event
    const loadedPromise = this.#events.waitFor(
      PluginActions.loaded,
      (action) => action.payload.uid === uid,
      { timeout: 30000 }
    );

    // Load the plugin (no need for force since we already unloaded)
    try {
      await this.#lifecycle.load(ref);
    } catch (error) {
      throw new Error(`Failed to load plugin ${uid}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Verify process was actually created
    if (!this.#lifecycle.hasProcess(ref)) {
      throw new Error(`Plugin ${uid} failed to start after load`);
    }

    // Wait for the plugin to be ready
    let action;
    try {
      action = await loadedPromise;
    } catch (error) {
      // If timeout, unload the plugin that failed to start
      await this.#lifecycle.unload(ref);
      throw new Error(`Plugin ${uid} failed to become ready within timeout: ${error instanceof Error ? error.message : String(error)}`);
    }

    await this.#events.dispatch(
      PluginActions.reloaded.create(
        { uid: action.payload.uid, name: action.payload.name, ref: action.payload.ref },
        'hub'
      )
    );
  }

  async kill(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);

    const process = this.#lifecycle.getProcess(ref);
    if (!process) return;

    process.kill(9);
    await this.#state.setHealth(ref, 'crashed', 'killed');
    await this.#lifecycle.unload(ref);
  }

  async load(ref: string): Promise<void> {
    return this.#lifecycle.load(ref);
  }

  async unload(ref: string, skipRestartReset = false): Promise<void> {
    return this.#lifecycle.unload(ref, skipRestartReset);
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

  async callTool(ref: string, toolName: string, args: Record<string, Json>, ctx: ToolCallContext): Promise<ToolResult> {
    const process = this.#lifecycle.getProcess(ref);
    if (!process) return { ok: false, content: `Plugin not loaded: ${ref}` };
    return process.callTool(toolName, args, ctx);
  }

  async executeBlock(blockType: string, config: Record<string, Json>, context: BlockContext): Promise<BlockResult> {
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

  #getRef(uid: string): string | null {
    const process = this.#lifecycle.getProcessByUid(uid);
    if (process) return process.ref;

    const stored = this.#state.getByUid(uid);
    return stored?.ref ?? null;
  }
}
