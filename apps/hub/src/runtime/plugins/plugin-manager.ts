import { inject, singleton } from '@brika/di';
import { errors } from '@brika/errors';
import { withPredicate } from '@brika/events';
import type { Json } from '@brika/ipc';
import type { Plugin } from '@brika/plugin';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { StateStore } from '@/runtime/state/state-store';
import { PluginErrors } from './plugin-errors';
import { PluginEventHandler } from './plugin-events';
import { type LoadOptions, PluginLifecycle } from './plugin-lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// PluginManager - Public API for plugin operations
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class PluginManager {
  readonly #lifecycle = inject(PluginLifecycle);
  readonly #state = inject(StateStore);
  readonly #events = inject(EventSystem);
  readonly #blocks = inject(BlockRegistry);
  readonly #eventHandler = inject(PluginEventHandler);

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

  getByName(name: string): Plugin | null {
    // Try to find by name in running processes
    const process = this.#lifecycle.getProcess(name);
    if (process) {
      return this.#lifecycle.toPlugin(process);
    }

    // Not found in running processes, get stored state
    const stored = this.#state.getWithMetadata(name);
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
    const process = this.#lifecycle.getProcess(name);
    if (process) {
      return process.uid;
    }

    const stored = this.#state.get(name);
    return stored?.uid ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle Operations
  // ─────────────────────────────────────────────────────────────────────────

  async enable(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) {
      throw errors.pluginNotFound({ pluginId: uid });
    }

    this.#state.setEnabled(name, true);
    const stored = this.#state.get(name);
    if (!stored) {
      throw errors.pluginNotFound({ pluginId: name });
    }

    const racePromise = this.#events.race(
      [
        withPredicate(PluginActions.loaded, (a) => a.payload.uid === uid),
        withPredicate(PluginActions.configInvalid, (a) => a.payload.uid === uid),
      ],
      {
        timeout: 30000,
      }
    );

    await this.#lifecycle.load(stored.rootDirectory);

    // `configInvalid` is intentionally non-fatal here: the lifecycle
    // has already transitioned the plugin to `awaiting-config` and the
    // UI renders a Configure CTA. Returning a generic 400 would defeat
    // that, so we resolve normally and let callers inspect health.
    await racePromise;
  }

  async disable(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) {
      throw errors.pluginNotFound({ pluginId: uid });
    }

    this.#state.setEnabled(name, false);
    await this.#lifecycle.unload(name);
  }

  async reload(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) {
      throw errors.pluginNotFound({ pluginId: uid });
    }

    // Unload the plugin first
    await this.#lifecycle.unload(name);

    // Verify process is actually gone
    if (this.#lifecycle.hasProcess(name)) {
      throw new Error(`Plugin ${uid} is still running after unload`);
    }

    // Get stored state to know the root directory
    const stored = this.#state.get(name);
    if (!stored) {
      throw errors.pluginNotFound({ pluginId: name });
    }

    // Set up race AFTER unloading to catch events from new load
    const racePromise = this.#events.race(
      [
        withPredicate(PluginActions.loaded, (a) => a.payload.uid === uid),
        withPredicate(PluginActions.configInvalid, (a) => a.payload.uid === uid),
      ],
      {
        timeout: 30000,
      }
    );

    // Load the plugin (no need for force since we already unloaded)
    try {
      await this.#lifecycle.load(stored.rootDirectory);
    } catch (error) {
      throw new Error(
        `Failed to load plugin ${uid}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Verify process was actually created
    if (!this.#lifecycle.hasProcess(name)) {
      throw new Error(`Plugin ${uid} failed to start after load`);
    }

    const result = await racePromise;
    // `configInvalid` is non-fatal: the lifecycle already set the
    // plugin to `awaiting-config`. Skip the `reloaded` dispatch since
    // the plugin is intentionally not running; the UI surfaces the
    // state via the plugin record.
    if (result.type === 'plugin.configInvalid') {
      return;
    }

    await this.#events.dispatch(
      PluginActions.reloaded.create(
        {
          uid: result.payload.uid,
          name: result.payload.name,
        },
        'hub'
      )
    );
  }

  async kill(uid: string): Promise<void> {
    const name = this.#getName(uid);
    if (!name) {
      throw errors.pluginNotFound({ pluginId: uid });
    }

    const process = this.#lifecycle.getProcess(name);
    if (!process) {
      return;
    }

    process.kill(9);
    this.#state.setHealth(name, 'crashed', PluginErrors.killed());
    await this.#lifecycle.unload(name);
  }

  load(moduleId: string, parent?: string, options?: LoadOptions): Promise<void> {
    return this.#lifecycle.load(moduleId, false, parent, options);
  }

  unload(name: string, skipRestartReset = false): Promise<void> {
    return this.#lifecycle.unload(name, skipRestartReset);
  }

  /** Unload a plugin and remove it from the state store (full uninstall). */
  async remove(name: string): Promise<void> {
    const rootDirectory =
      this.#lifecycle.getProcess(name)?.rootDirectory ?? this.#state.get(name)?.rootDirectory;
    if (this.#lifecycle.hasProcess(name)) {
      await this.#lifecycle.unload(name);
    }
    this.#lifecycle.removeModules(name, rootDirectory);
    this.#state.remove(name);
    this.#eventHandler.onPluginRemoved(name);
  }

  stopAll(): Promise<void> {
    return this.#lifecycle.stopAll();
  }

  restoreEnabledFromState(): Promise<void> {
    return this.#lifecycle.restoreEnabled();
  }

  cleanupStaleState(): Promise<void> {
    return this.#lifecycle.cleanupStale();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive Block Operations
  // ─────────────────────────────────────────────────────────────────────────

  setBlockEmitHandler(handler: (instanceId: string, port: string, data: Json) => void): void {
    this.#eventHandler.setBlockEmitHandler(handler);
  }

  clearBlockEmitHandler(handler?: (instanceId: string, port: string, data: Json) => void): void {
    this.#eventHandler.clearBlockEmitHandler(handler);
  }

  setBlockLogHandler(
    handler: (instanceId: string, workflowId: string, level: string, message: string) => void
  ): void {
    this.#eventHandler.setBlockLogHandler(handler);
  }

  clearBlockLogHandler(
    handler?: (instanceId: string, workflowId: string, level: string, message: string) => void
  ): void {
    this.#eventHandler.clearBlockLogHandler(handler);
  }

  startBlock(
    blockType: string,
    instanceId: string,
    workflowId: string,
    config: Record<string, Json>
  ): Promise<{
    ok: boolean;
    error?: string;
  }> {
    const pluginName = this.#blocks.getProvider(blockType);
    if (!pluginName) {
      return Promise.resolve({
        ok: false,
        error: `Unknown block type: ${blockType}`,
      });
    }

    const process = this.#lifecycle.getProcess(pluginName);
    if (!process) {
      return Promise.resolve({
        ok: false,
        error: `Plugin not loaded: ${pluginName}`,
      });
    }

    return process.startBlock(blockType, instanceId, workflowId, config);
  }

  broadcastTimezone(timezone: string | null): void {
    for (const process of this.#lifecycle.listProcesses()) {
      process.sendTimezone(timezone);
    }
  }

  pushBlockInput(instanceId: string, port: string, data: Json): void {
    // Find the process that owns this block instance
    // For now, broadcast to all processes (they'll ignore if instance not found)
    for (const process of this.#lifecycle.listProcesses()) {
      process.pushInput(instanceId, port, data);
    }
  }

  stopBlockInstance(instanceId: string): void {
    for (const process of this.#lifecycle.listProcesses()) {
      process.stopBlockInstance(instanceId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  #getName(uid: string): string | null {
    const process = this.#lifecycle.getProcessByUid(uid);
    if (process) {
      return process.name;
    }

    const stored = this.#state.getByUid(uid);
    return stored?.name ?? null;
  }
}
