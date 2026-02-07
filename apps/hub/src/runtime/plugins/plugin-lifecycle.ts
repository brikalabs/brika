import { inject, singleton } from '@brika/di';
import { spawnPlugin } from '@brika/ipc';
import type { Plugin, PluginHealth } from '@brika/shared';
import { PluginManagerConfig } from '@/runtime/config';
import { PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { I18nService } from '@/runtime/i18n';
import { Logger } from '@/runtime/logs/log-router';
import { MetricsStore } from '@/runtime/metrics';
import { type PluginStateWithMetadata, StateStore } from '@/runtime/state/state-store';
import { PluginConfigService } from './plugin-config';
import { PluginEventHandler } from './plugin-events';
import { PluginProcess } from './plugin-process';
import { PluginResolver } from './plugin-resolver';
import { RestartPolicy } from './restart-policy';
import { generateUid, HUB_VERSION, satisfiesVersion } from './utils';

/**
 * Manages plugin lifecycle: loading, unloading, and restart handling.
 * Simplified by delegating to focused helper classes.
 */
@singleton()
export class PluginLifecycle {
  readonly #config = inject(PluginManagerConfig);
  readonly #logs = inject(Logger).withSource('plugin');
  readonly #state = inject(StateStore);
  readonly #events = inject(EventSystem);
  readonly #i18n = inject(I18nService);
  readonly #eventHandler = inject(PluginEventHandler);
  readonly #pluginConfig = inject(PluginConfigService);
  readonly #metrics = inject(MetricsStore);
  readonly #resolver = new PluginResolver();

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

  // ───────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────

  getProcess(name: string): PluginProcess | undefined {
    return this.#processes.get(name);
  }

  getProcessByName(name: string): PluginProcess | undefined {
    return this.#processes.get(name);
  }

  hasProcessByName(name: string): boolean {
    return this.#processes.has(name);
  }

  getProcessByUid(uid: string): PluginProcess | undefined {
    for (const p of this.#processes.values()) {
      if (p.uid === uid) return p;
    }
    return undefined;
  }

  listProcesses(): PluginProcess[] {
    return [...this.#processes.values()];
  }

  getStatus(name: string): PluginHealth {
    if (this.#processes.has(name)) return 'running';
    if (this.#restartPolicy.getState(name)?.pendingTimer) return 'restarting';
    return this.#state.get(name)?.health ?? 'stopped';
  }

  toPlugin(process: PluginProcess): Plugin {
    return process.toPlugin('running');
  }

  fromStored(stored: PluginStateWithMetadata): Plugin {
    const process = this.#processes.get(stored.name);
    if (process) return this.toPlugin(process);

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
      rootDirectory: stored.rootDirectory,
      entryPoint: stored.entryPoint,
      status: this.getStatus(stored.name),
      pid: null,
      startedAt: null,
      lastError: stored.lastError,
      blocks: m.blocks ?? [],
      sparks: m.sparks ?? [],
      bricks: m.bricks ?? [],
      locales: [],
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Load/Unload
  // ───────────────────────────────────────────────────────────────────────

  async load(moduleId: string, force = false, parent?: string): Promise<void> {
    const { rootDirectory, entryPoint, metadata } = await this.#resolver.resolve(moduleId, parent);
    const pluginName = metadata.name;

    if (this.#processes.has(pluginName) && !force) return;

    if (force && this.#processes.has(pluginName)) {
      await this.unload(pluginName, true);
      if (this.#processes.has(pluginName)) {
        throw new Error(`Plugin ${pluginName} failed to unload`);
      }
    }

    if (!this.#checkCompatibility(metadata)) {
      throw new Error(`Plugin ${pluginName} is incompatible with hub v${HUB_VERSION}`);
    }

    const existingState = this.#state.get(pluginName);
    const uid = existingState?.uid ?? generateUid(metadata.name);
    const locales = await this.#i18n.registerPluginTranslations(metadata.name, rootDirectory);

    this.#logs.info('Starting plugin', {
      pluginName: pluginName,
      version: metadata.version,
      uid,
    });

    const channel = spawnPlugin('bun', [entryPoint], {
      cwd: rootDirectory,
      env: { ...globalThis.process.env, BRIKA_PLUGIN_NAME: metadata.name, BRIKA_PLUGIN_UID: uid },
      defaultTimeoutMs: this.#config.callTimeoutMs,
      onDisconnect: (error) => this.#handleDisconnect(pluginName, error),
      onStderr: (line) =>
        this.#logs.error(
          'Plugin error output received',
          {
            pluginName: pluginName,
            message: line,
          },
          { source: 'stderr' }
        ),
    });

    const process = new PluginProcess(
      channel,
      {
        name: pluginName,
        rootDirectory,
        entryPoint,
        uid,
        version: metadata.version,
        metadata,
        locales,
      },
      {
        heartbeatIntervalMs: this.#config.heartbeatEveryMs,
        heartbeatTimeoutMs: this.#config.heartbeatTimeoutMs,
      },
      {
        onReady: (p) => {
          // Validate preferences before sending
          const prefs = this.#pluginConfig.getConfig(p.name);
          const validation = this.#pluginConfig.validate(p.name, prefs);
          if (!validation.success) {
            const errors = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            this.#logs.error('Plugin preferences validation failed', {
              pluginName: p.name,
              errors,
            });
            // Dispatch event so reload/enable can handle it
            this.#events.dispatch(
              PluginActions.configInvalid.create({ uid: p.uid, name: p.name, errors }, 'hub')
            );
            // Gracefully stop (not crash) - won't trigger auto-restart
            this.unload(p.name);
            return;
          }
          p.sendPreferences(prefs);
          this.#eventHandler.onPluginReady(p);
        },
        onLog: (level, msg, meta) => this.#eventHandler.onPluginLog(pluginName, level, msg, meta),
        onBlock: (block) => this.#eventHandler.registerBlock(metadata.name, block, metadata),
        onBlockEmit: (instanceId, port, data) =>
          this.#eventHandler.onBlockEmit(instanceId, port, data),
        onBlockLog: (instanceId, workflowId, level, message) =>
          this.#eventHandler.onBlockLog(instanceId, workflowId, level, message),
        onSpark: (spark) => this.#eventHandler.registerSpark(metadata.name, spark),
        onSparkEmit: (sparkId, payload) =>
          this.#eventHandler.emitSpark(pluginName, sparkId, payload),
        onSparkSubscribe: (sparkType, subscriptionId, process) =>
          this.#eventHandler.subscribeToSparks(sparkType, (event) => {
            process.sendSparkEvent(subscriptionId, event);
          }),
        onSparkUnsubscribe: () => {
          // Cleanup handled by the process's unsubscribe callback
        },
        onBrickType: (brickType) => {
          const manifest = metadata.bricks?.find((c) => c.id === brickType.id);
          this.#eventHandler.registerBrickType(metadata.name, brickType, manifest);
        },
        onBrickInstancePatch: (instanceId, mutations) =>
          this.#eventHandler.patchBrickInstance(instanceId, mutations),
        onHeartbeatFailed: (p, silentMs) => this.#handleHeartbeatFailed(p, silentMs),
        onDisconnect: (p, error) => this.#handleDisconnect(p.name, error),
        onMetrics: (p, cpu, memory) => {
          this.#metrics.record(p.name, { ts: Date.now(), cpu, memory });
        },
      }
    );

    this.#processes.set(pluginName, process);
    this.#startStabilityCheck(process);
    this.#restartPolicy.onStart(pluginName);

    await this.#state.registerPlugin({ name: pluginName, rootDirectory, entryPoint, uid });
    await this.#state.setHealth(pluginName, 'restarting');
  }

  async unload(name: string, skipRestartReset = false): Promise<void> {
    const process = this.#processes.get(name);
    if (!process) return;

    this.#processes.delete(name);

    const timer = this.#stabilityTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.#stabilityTimers.delete(name);
    }

    process.stop();
    await new Promise((r) => setTimeout(r, 50));
    process.kill();

    // Clear metrics history for this plugin
    this.#metrics.clear(name);

    const restartState = this.#restartPolicy.getState(name);
    await this.#state.setHealth(name, restartState?.pendingTimer ? 'restarting' : 'stopped');

    if (!skipRestartReset) {
      this.#restartPolicy.reset(name);
    }

    this.#logs.info('Plugin unloaded successfully', { pluginName: name });
    this.#events.dispatch(
      PluginActions.unloaded.create({ uid: process.uid, name: process.name }, 'hub')
    );
  }

  async stopAll(): Promise<void> {
    const names = [...this.#processes.keys()];
    await Promise.all(names.map((name) => this.unload(name)));
  }

  async restoreEnabled(): Promise<void> {
    await this.#state.loadMetadataCache();

    for (const plugin of this.#state.listInstalledWithMetadata()) {
      if (!plugin.name || !plugin.rootDirectory || !plugin.entryPoint) {
        this.#logs.warn('Skipping plugin restoration due to incomplete data', {
          pluginName: plugin.name,
        });
        continue;
      }

      await this.#i18n.registerPluginTranslations(plugin.name, plugin.rootDirectory);

      if (plugin.enabled) {
        try {
          await this.load(plugin.rootDirectory);
        } catch (e) {
          this.#logs.error(
            'Failed to restore plugin',
            {
              pluginName: plugin.name,
            },
            { error: e }
          );
        }
      }
    }
  }

  async cleanupStale(): Promise<void> {
    for (const state of this.#state.listInstalled()) {
      if (!(await Bun.file(`${state.rootDirectory}/package.json`).exists())) {
        this.#logs.debug('Cleaning up stale plugin state', {
          pluginName: state.name,
          reason: 'package.json not found',
        });
        await this.#state.remove(state.name);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Private - Restart & Error Handling
  // ───────────────────────────────────────────────────────────────────────

  #handleHeartbeatFailed(process: PluginProcess, silentMs: number): void {
    this.#logs.error('Plugin heartbeat timeout', {
      pluginName: process.name,
      pid: process.pid,
      silentMs,
      timeoutMs: this.#config.heartbeatTimeoutMs,
    });

    this.#state.setHealth(process.name, 'crashed', 'heartbeat timeout');
    this.unload(process.name, true).then(() => {
      this.#attemptAutoRestart(process.name, 'heartbeat timeout');
    });
  }

  #handleDisconnect(name: string, error?: Error): void {
    const process = this.#processes.get(name);
    if (!process) return;

    const reason = error?.message ?? 'disconnected';
    this.#logs.error(
      'Plugin crashed unexpectedly',
      {
        pluginName: name,
        pid: process.pid,
        reason,
      },
      { error }
    );
    this.#state.setHealth(name, 'crashed', reason);

    this.#events.dispatch(
      PluginActions.error.create({ uid: process.uid, name: process.name, error: reason }, 'hub')
    );

    this.unload(name, true);
    this.#attemptAutoRestart(name, reason);
  }

  #attemptAutoRestart(name: string, reason: string): void {
    if (!this.#config.autoRestartEnabled) return;

    const pluginState = this.#state.get(name);
    if (!pluginState?.enabled) {
      this.#logs.debug('Skipping plugin restart (plugin disabled)', {
        pluginName: name,
      });
      return;
    }

    const decision = this.#restartPolicy.onCrash(name);

    if (decision.action === 'crash-loop') {
      this.#logs.error('Plugin entered crash loop', {
        pluginName: name,
        reason: decision.reason,
      });
      this.#state.setHealth(name, 'crash-loop', `Crash loop: ${decision.reason}`);
      return;
    }

    this.#logs.info('Plugin restart scheduled', {
      pluginName: name,
      delayMs: decision.delayMs,
      reason,
    });
    this.#state.setHealth(
      name,
      'restarting',
      `Restarting in ${Math.round(decision.delayMs / 1000)}s`
    );

    this.#restartPolicy.scheduleRestart(name, decision.delayMs, async () => {
      try {
        this.#logs.info('Attempting to restart plugin', { pluginName: name });
        await this.load(name);
        this.#logs.info('Plugin restarted successfully', { pluginName: name });
      } catch (e) {
        this.#logs.error(
          'Failed to restart plugin',
          {
            pluginName: name,
          },
          { error: e }
        );
      }
    });
  }

  #startStabilityCheck(process: PluginProcess): void {
    const timer = setInterval(() => {
      if (this.#restartPolicy.checkStability(process.name)) {
        this.#logs.debug('Plugin reached stability threshold', {
          pluginName: process.name,
          thresholdMs: this.#config.restartStabilityMs,
        });
        clearInterval(timer);
        this.#stabilityTimers.delete(process.name);
      }
    }, 5000);
    this.#stabilityTimers.set(process.name, timer);
  }

  #checkCompatibility(metadata: { name: string; engines?: { brika?: string } }): boolean {
    const required = metadata.engines?.brika;
    if (!required) {
      this.#logs.error('Plugin missing compatibility declaration', {
        pluginName: metadata.name,
        message: 'Plugin must declare engines.brika in package.json',
      });
      return false;
    }

    if (!satisfiesVersion(HUB_VERSION, required)) {
      this.#logs.error('Plugin incompatible with current hub version', {
        pluginName: metadata.name,
        requiredVersion: required,
        hubVersion: HUB_VERSION,
      });
      return false;
    }

    return true;
  }
}
