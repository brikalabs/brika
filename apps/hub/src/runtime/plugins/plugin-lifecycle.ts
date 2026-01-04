import type { Json } from '@brika/ipc';
import { spawnPlugin } from '@brika/ipc';
import type { BrikaEvent, LogLevel, Plugin, PluginHealth, PluginManifest } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginManagerConfig } from '@/runtime/config';
import { GenericEventActions, PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { I18nService } from '@/runtime/i18n';
import { LogRouter } from '@/runtime/logs/log-router';
import { PluginRegistry } from '@/runtime/registry';
import { type PluginStateWithMetadata, StateStore } from '@/runtime/state/state-store';
import { ToolRegistry } from '@/runtime/tools/tool-registry';
import { PluginProcess } from './plugin-process';
import { RestartPolicy } from './restart-policy';
import { generateUid, HUB_VERSION, now, satisfiesVersion } from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// PluginLifecycle - Manages plugin loading, unloading, and restarts
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class PluginLifecycle {
  readonly #config = inject(PluginManagerConfig);
  readonly #tools = inject(ToolRegistry);
  readonly #blocks = inject(BlockRegistry);
  readonly #logs = inject(LogRouter);
  readonly #registry = inject(PluginRegistry);
  readonly #state = inject(StateStore);
  readonly #events = inject(EventSystem);
  readonly #i18n = inject(I18nService);

  readonly #processes = new Map<string, PluginProcess>();
  readonly #stabilityTimers = new Map<string, Timer>();
  readonly #restartPolicy: RestartPolicy;

  constructor() {
    this.#restartPolicy = new RestartPolicy({
      baseDelayMs: this.#config.restartBaseDelayMs,
      maxDelayMs: this.#config.restartMaxDelayMs,
      maxCrashes: this.#config.restartMaxCrashes,
      crashWindowMs: this.#config.restartCrashWindowMs,
      stabilityThresholdMs: this.#config.restartStabilityMs,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors
  // ─────────────────────────────────────────────────────────────────────────

  getProcess(ref: string): PluginProcess | undefined {
    return this.#processes.get(ref);
  }

  getProcessByUid(uid: string): PluginProcess | undefined {
    for (const p of this.#processes.values()) {
      if (p.uid === uid) return p;
    }
    return undefined;
  }

  getProcessByName(name: string): PluginProcess | undefined {
    for (const p of this.#processes.values()) {
      if (p.name === name) return p;
    }
    return undefined;
  }

  listProcesses(): PluginProcess[] {
    return [...this.#processes.values()];
  }

  hasProcess(ref: string): boolean {
    return this.#processes.has(ref);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin Status
  // ─────────────────────────────────────────────────────────────────────────

  isReady(ref: string): boolean {
    return this.#state.get(ref)?.health === 'running';
  }

  getStatus(ref: string): PluginHealth {
    // If process exists, it's running
    if (this.#processes.has(ref)) {
      return 'running';
    }

    // Check if restart is pending
    const restartState = this.#restartPolicy.getState(ref);
    if (restartState?.pendingTimer) {
      return 'restarting';
    }

    // Return stored health (defaults to 'stopped')
    return this.#state.get(ref)?.health ?? 'stopped';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────────────────

  async load(ref: string, force = false): Promise<void> {
    if (this.#processes.has(ref) && !force) return;
    // If force is true and process exists, unload it first
    if (this.#processes.has(ref) && force) {
      await this.unload(ref, true);
      // Verify process is actually gone
      if (this.#processes.has(ref)) {
        throw new Error(`Plugin ${ref} failed to unload before reload`);
      }
    }

    const entry = this.#resolveEntry(ref);
    if (!entry) throw new Error(`Cannot resolve plugin: ${ref}`);

    const pluginDir = entry.substring(0, entry.lastIndexOf('/')).replace(/\/src$/, '');
    const metadata = await this.#state.refreshMetadata(ref, pluginDir);

    if (!this.#checkCompatibility(metadata)) {
      throw new Error(`Plugin ${metadata.name} is not compatible with this hub version`);
    }

    const existingState = this.#state.get(ref);
    const uid = existingState?.uid ?? generateUid(metadata.name);
    const locales = await this.#i18n.registerPluginTranslations(metadata.name, pluginDir);

    const channel = spawnPlugin('bun', [entry], {
      cwd: globalThis.process.cwd(),
      env: { ...globalThis.process.env, BRIKA_PLUGIN_REF: ref, BRIKA_PLUGIN_NAME: metadata.name },
      defaultTimeoutMs: this.#config.callTimeoutMs,
      onDisconnect: (error) => this.#handleDisconnect(ref, error),
      onStderr: (line) => this.#logs.error('plugin.stderr', { name: metadata.name, message: line }),
    });

    const pluginProcess = new PluginProcess(
      channel,
      {
        ref,
        dir: pluginDir,
        uid,
        name: metadata.name,
        version: metadata.version,
        metadata,
        locales,
      },
      {
        heartbeatIntervalMs: this.#config.heartbeatEveryMs,
        heartbeatTimeoutMs: this.#config.heartbeatTimeoutMs,
      },
      {
        onReady: (p) => this.#onPluginReady(p),
        onLog: (level, message, meta) => this.#onPluginLog(ref, level, message, meta),
        onTool: (tool) => this.#registerTool(ref, metadata.name, tool),
        onBlock: (block) => this.#registerBlock(metadata.name, block),
        onEvent: (eventType, payload) => this.#emitPluginEvent(ref, eventType, payload),
        onSubscribe: (patterns, handler) => this.#subscribeToEvents(patterns, handler),
        onHeartbeatFailed: (p, silentMs) => this.#handleHeartbeatFailed(p, silentMs),
        onDisconnect: (p, error) => this.#handleDisconnect(p.ref, error),
      }
    );

    this.#processes.set(ref, pluginProcess);
    this.#startStabilityCheck(pluginProcess);
    this.#restartPolicy.onStart(ref);

    await this.#state.registerPlugin({ ref, dir: pluginDir, uid });
    // Update health to 'restarting' immediately when process is created
    // This ensures status is correct even before plugin sends hello
    await this.#state.setHealth(ref, 'restarting');
  }

  async unload(ref: string, skipRestartReset = false): Promise<void> {
    const pluginProcess = this.#processes.get(ref);
    if (!pluginProcess) return;

    // Remove from map FIRST so #handleDisconnect() will see it's gone and skip
    this.#processes.delete(ref);

    // Clean up timers
    const stabilityTimer = this.#stabilityTimers.get(ref);
    if (stabilityTimer) {
      clearInterval(stabilityTimer);
      this.#stabilityTimers.delete(ref);
    }

    // Stop and kill process (disconnect handler will see process is gone and skip)
    pluginProcess.stop();
    await new Promise((r) => setTimeout(r, 50));
    pluginProcess.kill();

    // Clean up registries
    this.#tools.unregisterByOwner(pluginProcess.name);
    this.#blocks.unregisterPlugin(pluginProcess.name);

    // Update health status
    const restartState = this.#restartPolicy.getState(ref);
    await this.#state.setHealth(ref, restartState?.pendingTimer ? 'restarting' : 'stopped');

    if (!skipRestartReset) {
      this.#restartPolicy.reset(ref);
    }

    this.#logs.info('plugin.unloaded', { ref, name: pluginProcess.name });
    this.#events.dispatch(
      PluginActions.unloaded.create(
        { uid: pluginProcess.uid, name: pluginProcess.name, ref },
        'hub'
      )
    );
  }

  async stopAll(): Promise<void> {
    const refs = [...this.#processes.keys()];
    await Promise.all(refs.map((ref) => this.unload(ref)));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Restore & Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  async restoreEnabled(): Promise<void> {
    await this.#state.loadMetadataCache();

    for (const plugin of this.#state.listInstalledWithMetadata()) {
      await this.#i18n.registerPluginTranslations(plugin.name, plugin.dir);

      if (plugin.enabled) {
        try {
          await this.load(plugin.ref);
        } catch (e) {
          this.#logs.error('plugin.restore.error', { ref: plugin.ref, error: String(e) });
        }
      }
    }
  }

  async cleanupStale(): Promise<void> {
    for (const state of this.#state.listInstalled()) {
      if (state.ref.startsWith('file:')) {
        const filePath = state.ref.slice('file:'.length);
        if (!(await Bun.file(filePath).exists())) {
          this.#logs.debug('plugin.state.cleanup', { ref: state.ref, reason: 'file not found' });
          await this.#state.remove(state.ref);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Conversion Helpers
  // ─────────────────────────────────────────────────────────────────────────

  toPlugin(process: PluginProcess): Plugin {
    return process.toPlugin('running');
  }

  fromStored(stored: PluginStateWithMetadata): Plugin {
    // If a process exists for this ref, use the process data
    const process = this.#processes.get(stored.ref);
    if (process) {
      return this.toPlugin(process);
    }

    // No process exists, return stored data
    const m = stored.metadata;
    return {
      uid: stored.uid,
      name: stored.name,
      version: stored.version,
      description: m.description ?? null,
      author: m.author ?? null,
      homepage: m.homepage ?? null,
      repository: m.repository ?? null,
      icon: m.icon ?? null,
      keywords: m.keywords ?? [],
      license: m.license ?? null,
      engines: m.engines,
      ref: stored.ref,
      dir: stored.dir,
      status: this.getStatus(stored.ref),
      pid: null,
      startedAt: null,
      lastError: stored.lastError,
      tools: m.tools ?? [],
      blocks: m.blocks ?? [],
      locales: [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private - Callbacks
  // ─────────────────────────────────────────────────────────────────────────

  #onPluginReady(pluginProcess: PluginProcess): void {
    this.#state.setHealth(pluginProcess.ref, 'running');
    this.#logs.info('plugin.loaded', {
      ref: pluginProcess.ref,
      name: pluginProcess.name,
      uid: pluginProcess.uid,
      version: pluginProcess.version,
      pid: pluginProcess.pid,
    });
    this.#events.dispatch(PluginActions.loaded.create(pluginProcess, 'hub'));
  }

  #onPluginLog(ref: string, level: string, message: string, meta?: Record<string, unknown>): void {
    this.#logs.emit({
      ts: now(),
      level: level as LogLevel,
      source: 'plugin',
      pluginRef: ref,
      message,
      meta: meta as Record<string, Json> | undefined,
    });
  }

  #registerTool(
    ref: string,
    pluginName: string,
    tool: { id: string; description?: string; icon?: string; color?: string; inputSchema?: unknown }
  ): void {
    const pluginProcess = this.#processes.get(ref);
    if (!pluginProcess) return;

    this.#tools.register(tool.id, pluginName, {
      description: tool.description,
      icon: tool.icon,
      color: tool.color,
      // biome-ignore lint/suspicious/noExplicitAny: inputSchema type varies between IPC and registry
      inputSchema: tool.inputSchema as any,
      call: (args, ctx) => pluginProcess.callTool(tool.id, args, ctx),
    });
    this.#logs.debug('plugin.tool.registered', {
      tool: `${pluginName}:${tool.id}`,
      plugin: pluginName,
    });
  }

  #registerBlock(pluginName: string, block: { id: string; [key: string]: unknown }): void {
    // biome-ignore lint/suspicious/noExplicitAny: IPC and SDK types are structurally compatible
    this.#blocks.register(block as any, pluginName);
    this.#logs.debug('plugin.block.registered', {
      block: `${pluginName}:${block.id}`,
      plugin: pluginName,
    });
  }

  #emitPluginEvent(ref: string, eventType: string, payload: Json): void {
    this.#events.dispatch(
      GenericEventActions.emit.create({ type: eventType, source: ref, payload }, ref)
    );
  }

  #subscribeToEvents(patterns: string[], handler: (event: BrikaEvent) => void): () => void {
    const regexes = patterns.map(
      (p) => new RegExp(`^${p.replaceAll('.', '\\.').replaceAll('*', '.*')}$`)
    );

    return this.#events.subscribeAll((action) => {
      const matches = regexes.some((r) => r.test(action.type));
      if (!matches) return;

      handler({
        id: action.id,
        type: action.type,
        source: action.source ?? 'unknown',
        payload: action.payload as Json,
        ts: action.timestamp,
      });
    });
  }

  #handleHeartbeatFailed(process: PluginProcess, silentMs: number): void {
    this.#logs.error('plugin.heartbeat.missed', {
      ref: process.ref,
      name: process.name,
      pid: process.pid,
      silentMs,
      timeoutMs: this.#config.heartbeatTimeoutMs,
    });

    this.#state.setHealth(process.ref, 'crashed', 'heartbeat timeout');
    this.unload(process.ref, true).then(() => {
      this.#attemptAutoRestart(process.ref, 'heartbeat timeout');
    });
  }

  #handleDisconnect(ref: string, error?: Error): void {
    // If process is not in map, it's already being unloaded (unload() deletes it first)
    const process = this.#processes.get(ref);
    if (!process) return;

    const reason = error?.message ?? 'disconnected';
    this.#logs.error('plugin.crashed', { ref, name: process.name, pid: process.pid, reason });
    this.#state.setHealth(ref, 'crashed', reason);

    this.#events.dispatch(
      PluginActions.error.create({ uid: process.uid, name: process.name, error: reason }, 'hub')
    );

    this.unload(ref, true);
    this.#attemptAutoRestart(ref, reason);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private - Auto Restart
  // ─────────────────────────────────────────────────────────────────────────

  #attemptAutoRestart(ref: string, reason: string): void {
    if (!this.#config.autoRestartEnabled) return;

    const pluginState = this.#state.get(ref);
    if (!pluginState?.enabled) {
      this.#logs.debug('plugin.restart.skip', { ref, reason: 'plugin disabled' });
      return;
    }

    const decision = this.#restartPolicy.onCrash(ref);

    if (decision.action === 'crash-loop') {
      this.#logs.error('plugin.crash-loop', { ref, reason: decision.reason });
      this.#state.setHealth(ref, 'crash-loop', `Crash loop detected: ${decision.reason}`);
      return;
    }

    this.#logs.info('plugin.restart.scheduled', {
      ref,
      delayMs: decision.delayMs,
      crashReason: reason,
    });
    this.#state.setHealth(
      ref,
      'restarting',
      `Restarting in ${Math.round(decision.delayMs / 1000)}s`
    );

    this.#restartPolicy.scheduleRestart(ref, decision.delayMs, async () => {
      try {
        this.#logs.info('plugin.restart.attempting', { ref });
        await this.load(ref);
        this.#logs.info('plugin.restart.success', { ref });
      } catch (e) {
        this.#logs.error('plugin.restart.failed', { ref, error: String(e) });
      }
    });
  }

  #startStabilityCheck(process: PluginProcess): void {
    const timer = setInterval(() => {
      if (this.#restartPolicy.checkStability(process.ref)) {
        this.#logs.debug('plugin.stable', {
          ref: process.ref,
          name: process.name,
          thresholdMs: this.#config.restartStabilityMs,
        });
        clearInterval(timer);
        this.#stabilityTimers.delete(process.ref);
      }
    }, 5000);
    this.#stabilityTimers.set(process.ref, timer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private - Helpers
  // ─────────────────────────────────────────────────────────────────────────

  #resolveEntry(ref: string): string | null {
    if (ref.startsWith('file:')) {
      const p = ref.slice('file:'.length);
      return p.startsWith('/') ? p : `${process.cwd()}/${p}`;
    }
    return this.#registry.resolve(ref);
  }

  #checkCompatibility(metadata: PluginManifest): boolean {
    const required = metadata.engines?.brika;
    if (!required) {
      this.#logs.error('plugin.compatibility.missing', {
        name: metadata.name,
        message: 'Plugin must declare engines.brika in package.json',
      });
      return false;
    }

    if (!satisfiesVersion(HUB_VERSION, required)) {
      this.#logs.error('plugin.compatibility.failed', {
        name: metadata.name,
        required,
        hubVersion: HUB_VERSION,
      });
      return false;
    }

    return true;
  }
}
