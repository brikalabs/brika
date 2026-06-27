import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Analytics } from '@brika/analytics';
import { inject, singleton } from '@brika/di';
import { withPredicate } from '@brika/events';
import type { LogLevelType } from '@brika/ipc/contract';
import type { Plugin, PluginHealth } from '@brika/plugin';
import type { PluginPackageSchema } from '@brika/schema';
import { BlockRegistry } from '@/runtime/blocks';
import { BunRunner, PluginManagerConfig } from '@/runtime/config';
import { BrikaInitializer } from '@/runtime/config/brika-initializer';
import { BrickActions, PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { I18nService } from '@/runtime/i18n';
import { Logger } from '@/runtime/logs/log-router';
import { MetricsStore } from '@/runtime/metrics';
import { type CompileSummary, ModuleCompiler } from '@/runtime/modules';
import { MODULE_KINDS, resolveModuleUrl } from '@/runtime/modules/module-kinds';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { type PluginStateWithMetadata, StateStore } from '@/runtime/state/state-store';
import { ToolRegistry } from '@/runtime/tools/tool-registry';
import { pluginFsDirs } from './fs-dirs';
import { buildHubGrants } from './grants/registry-factory';
import { buildVectorWithUserConsent, familiesForManifestGrants } from './grants/vector';
import { compileServerEntry, PluginProcess, spawnPlugin } from './lifecycle-deps';
import { PluginConfigService } from './plugin-config';
import { PluginErrors } from './plugin-errors';
import { PluginEventHandler } from './plugin-events';
import { PluginReaper, type ReapGuard } from './plugin-reaper';
import { PluginResolver } from './plugin-resolver';
import { PluginWatcher } from './plugin-watcher';
import { resolvePreludePath } from './prelude-locator';
import { RestartPolicy } from './restart-policy';
import { pickLauncher, readSandboxModeFromEnv, type SandboxLauncher } from './sandbox';
import { ensurePluginTsconfig, generateUid, HUB_VERSION, satisfiesVersion } from './utils';

type PluginProcessInstance = InstanceType<typeof PluginProcess>;

/**
 * Shared registry used to derive permission families for the
 * UI-facing `Plugin` metadata when the plugin is not currently running.
 * Running plugins use their own process-scoped registry.
 */
const sharedGrantRegistry = buildHubGrants({
  fetch: () => Promise.reject(new Error('shared registry: fetch is not wired')),
});

/**
 * Grant id for the raw-socket capability. Realised at the L1 lockdown (not
 * dispatched): when this grant is in the plugin's consented vector, the hub
 * forwards `BRIKA_PLUGIN_RAW_SOCKETS=1` so the prelude leaves UDP/TCP
 * primitives intact. See `packages/sdk/src/grants/net.ts` (`netSocket`).
 */
const RAW_SOCKET_GRANT_ID = 'dev.brika.net.socket';

/**
 * True when the plugin both requests `net.socket` in its manifest and the
 * operator has consented to the `rawSocket` family, i.e. the grant survives
 * vector construction. Gates the `BRIKA_PLUGIN_RAW_SOCKETS` env the lockdown
 * reads at process boot (the vector itself arrives over IPC only after boot,
 * so the decision must be compiled to an env var here).
 */
function rawSocketsConsented(
  manifestGrants: Readonly<Record<string, unknown>> | undefined,
  grantedFamilies: ReadonlyArray<string>
): boolean {
  const vector = buildVectorWithUserConsent(sharedGrantRegistry, manifestGrants, grantedFamilies);
  return vector.grants.some((grant) => grant.id === RAW_SOCKET_GRANT_ID);
}

/** Grant-id prefixes that imply the plugin legitimately needs IP egress. */
const NETWORK_GRANT_PREFIXES = ['dev.brika.net.', 'dev.brika.ws.', 'dev.brika.dns.'];

/**
 * True when the plugin holds any network-capable grant (net.fetch/socket, ws,
 * dns) after operator consent. Drives the kernel sandbox's `allowNetwork`: a
 * grant-less plugin gets IP egress denied at the kernel (unix IPC still allowed),
 * restoring the DNS-rebind and bare-import backstops that assume that deny.
 */
function networkConsented(
  manifestGrants: Readonly<Record<string, unknown>> | undefined,
  grantedFamilies: ReadonlyArray<string>
): boolean {
  const vector = buildVectorWithUserConsent(sharedGrantRegistry, manifestGrants, grantedFamilies);
  return vector.grants.some((grant) =>
    NETWORK_GRANT_PREFIXES.some((prefix) => grant.id.startsWith(prefix))
  );
}

/**
 * Manages plugin lifecycle: loading, unloading, and restart handling.
 * Simplified by delegating to focused helper classes.
 */
/**
 * Allocate the four host directories that back a plugin's virtual fs roots
 * and ensure they exist. Bundle is the install dir (read-only); data/cache/tmp
 * live under `<brikaDir>/plugins/data/<uid>/`.
 */
function allocateFsDirs(
  brikaDir: string,
  uid: string,
  rootDirectory: string
): { bundle: string; data: string; cache: string; tmp: string } {
  const dirs = pluginFsDirs(brikaDir, uid, rootDirectory);
  mkdirSync(dirs.data, { recursive: true });
  mkdirSync(dirs.cache, { recursive: true });
  mkdirSync(dirs.tmp, { recursive: true });
  return dirs;
}

/** True when a plugin's manifest requests one or more grants (capabilities). */
function pluginRequestsGrants(metadata: { grants?: Record<string, unknown> }): boolean {
  return metadata.grants !== undefined && Object.keys(metadata.grants).length > 0;
}

export interface LoadOptions {
  /**
   * Whether a FIRST-time load (no prior state row) should start the plugin.
   * Install passes `true` for local/dev plugins so they run immediately; left
   * undefined a grant-requesting plugin installs dormant (consent-before-code).
   * Ignored once the plugin has an explicit enabled/disabled choice in state.
   */
  defaultEnabled?: boolean;
  /**
   * Reload even when the plugin is already running. An explicit install/update sets this so an
   * already-loaded plugin (e.g. a workspace plugin auto-loaded at boot) is recompiled (running the
   * freshly-linked code and surfacing the build trace) instead of no-op'ing on the existing process.
   */
  force?: boolean;
}

@singleton()
export class PluginLifecycle {
  readonly #config = inject(PluginManagerConfig);
  readonly #bunRunner = inject(BunRunner);
  readonly #brikaInit = inject(BrikaInitializer);
  readonly #logs = inject(Logger).withSource('plugin');
  // Hub-origin analytics: lifecycle/system events the hub itself observes.
  // Plugin-origin capture forwarding lives in PluginEventHandler (source 'plugin').
  readonly #analytics = inject(Analytics);
  readonly #state = inject(StateStore);
  readonly #events = inject(EventSystem);
  readonly #i18n = inject(I18nService);
  readonly #eventHandler = inject(PluginEventHandler);
  readonly #tools = inject(ToolRegistry);
  readonly #blockRegistry = inject(BlockRegistry);
  readonly #pluginConfig = inject(PluginConfigService);
  readonly #metrics = inject(MetricsStore);
  readonly #moduleCompiler = inject(ModuleCompiler);
  readonly #secrets = inject(SecretStore);
  readonly #resolver = new PluginResolver();

  readonly #processes = new Map<string, PluginProcessInstance>();
  readonly #uidIndex = new Map<string, string>(); // uid → plugin name
  readonly #stabilityTimers = new Map<string, Timer>();
  /**
   * Per-plugin operation chain. Serializes load/unload for a plugin so
   * concurrent reloads cannot interleave and leak orphan host processes.
   */
  readonly #opChains = new Map<string, Promise<unknown>>();
  readonly #restartPolicy: RestartPolicy;
  readonly #watcher = inject(PluginWatcher);
  /**
   * Scale-to-zero reaper. Off unless `idleReapMs > 0`. Reaps idle plugin
   * processes (keeping them enabled + block-registered so they respawn on the
   * next event); guarded so a plugin whose blocks a running workflow owns, or
   * one mid-call, is never reaped.
   */
  readonly #reaper: PluginReaper;
  /**
   * L3 sandbox launcher. macOS wraps every plugin spawn in
   * `sandbox-exec`; Linux + Windows currently no-op (the JS-layer
   * defences still apply). Mode read from `BRIKA_SANDBOX_MODE` once
   * at construction so operator flips on restart, not mid-session.
   */
  readonly #sandboxLauncher: SandboxLauncher = pickLauncher(readSandboxModeFromEnv());

  constructor() {
    this.#restartPolicy = new RestartPolicy({
      baseDelayMs: this.#config.restartBaseDelayMs,
      maxDelayMs: this.#config.restartMaxDelayMs,
      maxCrashes: this.#config.restartMaxCrashes,
      crashWindowMs: this.#config.restartCrashWindowMs,
      stabilityThresholdMs: this.#config.restartStabilityMs,
    });

    this.#reaper = new PluginReaper({
      idleReapMs: this.#config.idleReapMs,
      keepWarmCount: this.#config.keepWarmCount,
      // Sweep often enough to honour the window without busy-looping: a quarter
      // of the window, clamped to [1s, 30s].
      sweepIntervalMs: Math.min(30_000, Math.max(1000, Math.floor(this.#config.idleReapMs / 4))),
      now: () => Date.now(),
      listProcesses: () =>
        this.listProcesses().map((p) => ({
          name: p.name,
          lastActivityAt: p.lastActivityAt,
          hasInFlight: p.hasInFlight,
        })),
      reap: (name) => {
        void this.#reap(name);
      },
    });
    // Never reap a plugin that exposes a passive UI surface (board bricks or
    // pages render live and push data); there is no inbound request to lazily
    // respawn them on. Headless plugins (blocks, tools, routes, actions) reap
    // and respawn on their next use.
    this.#reaper.addGuard((name) => {
      const meta = this.#processes.get(name)?.metadata;
      if (!meta) {
        return false;
      }
      return (meta.bricks?.length ?? 0) > 0 || (meta.pages?.length ?? 0) > 0;
    });
    // No-op when reaping is disabled (idleReapMs <= 0), so the default config
    // keeps the pre-scale-to-zero behaviour and tests start no timer.
    this.#reaper.start();

    this.#watcher.setReloadHandler((pluginName) => {
      const process = this.#processes.get(pluginName);
      if (!process) {
        return;
      }
      const rootDir = process.rootDirectory;
      const uid = process.uid;
      this.load(rootDir, true)
        .then(() => {
          // Dev-mode hot reload: a source change was detected, the plugin
          // rebuilt and reloaded. Debounced in the watcher, so this is a
          // discrete event, not a hot path.
          this.#analytics.capture('plugin.hot_reloaded', { uid }, { pluginName });
          this.#events.dispatch(PluginActions.reloaded.create({ uid, name: pluginName }, 'hub'));
          // Notify UI about recompiled client-side brick modules
          this.#emitModuleRecompiled(pluginName);
        })
        .catch((e) => {
          this.#analytics.capture(
            'plugin.hot_reload_failed',
            { uid, reason: e instanceof Error ? e.name : 'unknown' },
            { pluginName }
          );
          this.#logs.error('Hot reload failed', { pluginName }, { error: e });
        });
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────

  getProcess(name: string): PluginProcessInstance | undefined {
    return this.#processes.get(name);
  }

  hasProcess(name: string): boolean {
    return this.#processes.has(name);
  }

  getProcessByUid(uid: string): PluginProcessInstance | undefined {
    const name = this.#uidIndex.get(uid);
    return name ? this.#processes.get(name) : undefined;
  }

  /** Resolve a plugin UID to its name, falling back to persisted state. */
  resolvePluginNameByUid(uid: string): string | undefined {
    const process = this.getProcessByUid(uid);
    if (process) {
      return process.name;
    }
    return this.#state.getByUid(uid)?.name;
  }

  listProcesses(): PluginProcessInstance[] {
    return [...this.#processes.values()];
  }

  /**
   * Pin plugins against scale-to-zero reaping. The predicate returns true for
   * a plugin that must stay resident (e.g. a running workflow owns one of its
   * blocks, or it hosts a live in-plugin trigger). Returns a disposer. Guards
   * compose: any guard returning true keeps the plugin alive.
   */
  addReapGuard(guard: ReapGuard): () => void {
    return this.#reaper.addGuard(guard);
  }

  /**
   * Ensure a plugin is running, spawning it on demand if it was reaped (or
   * never started this session) and awaiting readiness. Returns the live
   * process, or undefined if the plugin is unknown or the operator disabled it
   * (a disabled plugin must stay down: reaping only respawns *enabled* ones).
   */
  async ensureStarted(name: string): Promise<PluginProcessInstance | undefined> {
    const existing = this.#processes.get(name);
    if (existing) {
      return existing;
    }
    const stored = this.#state.get(name);
    if (!stored || stored.enabled === false) {
      return undefined;
    }

    // Mirror enable(): wait until the respawned plugin is actually ready (or
    // its config is found invalid) before handing it back, so the caller can
    // immediately start blocks / push input without racing the boot.
    const racePromise = this.#events.race(
      [
        withPredicate(PluginActions.loaded, (a) => a.payload.name === name),
        withPredicate(PluginActions.configInvalid, (a) => a.payload.name === name),
      ],
      { timeout: 30_000 }
    );
    await this.load(stored.rootDirectory);
    await racePromise;
    return this.#processes.get(name);
  }

  getStatus(name: string): PluginHealth {
    if (this.#processes.has(name)) {
      return 'running';
    }
    if (this.#restartPolicy.getState(name)?.pendingTimer) {
      return 'restarting';
    }
    return this.#state.get(name)?.health ?? 'stopped';
  }

  toPlugin(process: PluginProcessInstance): Plugin {
    return process.toPlugin('running');
  }

  fromStored(stored: PluginStateWithMetadata): Plugin {
    const process = this.#processes.get(stored.name);
    if (process) {
      return this.toPlugin(process);
    }

    const m = stored.metadata;
    return {
      uid: stored.uid,
      name: stored.name,
      version: stored.version,
      displayName: m.displayName ?? null,
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
      pages: m.pages ?? [],
      permissions: familiesForManifestGrants(sharedGrantRegistry, m.grants),
      grants: m.grants ?? {},
      grantedPermissions: stored.grantedPermissions ?? [],
      locales: [],
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Load/Unload
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Run `fn` after any in-flight load/unload for `key` settles, chaining so
   * operations on the same plugin never overlap. The tail promise never
   * rejects, so one failed op does not wedge the chain, and the map entry is
   * cleaned up once it is the last link.
   */
  #serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.#opChains.get(key) ?? Promise.resolve();
    const run = tail.then(fn, fn);
    const guarded = run.then(
      () => undefined,
      () => undefined
    );
    this.#opChains.set(key, guarded);
    guarded.then(() => {
      if (this.#opChains.get(key) === guarded) {
        this.#opChains.delete(key);
      }
    });
    return run;
  }

  async load(
    moduleId: string,
    force = false,
    parent?: string,
    options?: LoadOptions
  ): Promise<void> {
    const resolved = await this.#resolver.resolve(moduleId, parent);
    // Serialize all load/unload work for a given plugin so concurrent reloads
    // (a burst of source saves each firing the watcher) cannot race to spawn
    // two host processes and leak one as an orphan.
    return this.#serialize(resolved.metadata.name, () =>
      this.#loadResolved(resolved, force, options?.defaultEnabled)
    );
  }

  async #loadResolved(
    resolved: Awaited<ReturnType<PluginResolver['resolve']>>,
    force: boolean,
    defaultEnabled?: boolean
  ): Promise<void> {
    const { rootDirectory, entryPoint, metadata } = resolved;
    const pluginName = metadata.name;

    if (this.#processes.has(pluginName) && !force) {
      return;
    }

    if (force && this.#processes.has(pluginName)) {
      await this.#unloadInner(pluginName, true);
      if (this.#processes.has(pluginName)) {
        throw new Error(`Plugin ${pluginName} failed to unload`);
      }
    }

    if (!this.#checkCompatibility(metadata)) {
      await this.#registerIncompatible(pluginName, rootDirectory, entryPoint, metadata);
      return;
    }

    const existingState = this.#state.get(pluginName);
    const uid = existingState?.uid ?? generateUid(metadata.name);

    const locales = await this.#i18n.registerPluginTranslations(metadata.name, rootDirectory);

    // Surface the build live over `/api/stream/events` so the UI can show compilation step-by-step
    // while a plugin installs, enables, or reloads. The build runs even for a plugin that will stay
    // dormant (see the consent gate below the build): compiling bundles the code, it never executes
    // it, so consent-before-code is preserved while the operator still sees the build on install.
    const compileStart = performance.now();
    this.#emitCompile(uid, pluginName, { phase: 'start' });

    const clientSummary = await this.#guardCompile(uid, pluginName, () =>
      this.#compilePluginModules(metadata, rootDirectory)
    );
    for (const k of clientSummary.kinds) {
      this.#emitCompile(uid, pluginName, {
        phase: 'progress',
        step: k.kind,
        modules: k.modules,
        chunks: k.chunks,
        cached: k.cached,
        durationMs: k.durationMs,
      });
    }

    // Build the server-side entry: action IDs are injected at compile time
    const outdir = join(rootDirectory, 'node_modules', '.cache', 'brika', 'server');
    const serverExternals = computeServerExternals(metadata);
    const serverStart = performance.now();
    const buildResult = await this.#guardCompile(uid, pluginName, () =>
      compileServerEntry({
        entrypoint: entryPoint,
        pluginRoot: rootDirectory,
        outdir,
        external: serverExternals,
        bytecode: this.#config.bytecode,
      })
    );

    if (buildResult.success) {
      this.#logs.debug(buildResult.cached ? 'Server build cached' : 'Server build compiled', {
        pluginName,
      });
      this.#emitCompile(uid, pluginName, {
        phase: 'progress',
        step: 'server',
        modules: 1,
        cached: buildResult.cached,
        durationMs: Math.round(performance.now() - serverStart),
      });
    }

    if (!buildResult.success) {
      this.#logs.error('Server build failed', {
        pluginName,
        errors: buildResult.errors.join('; '),
      });
      this.#emitCompile(uid, pluginName, {
        phase: 'error',
        step: 'server',
        message: buildResult.errors.join('; '),
      });
      this.#analytics.capture(
        'plugin.load_failed',
        { uid, reason: 'build_failed', errorCount: buildResult.errors.length },
        { pluginName }
      );
      // Persist plugin state before setting health so it can be restored later
      this.#state.registerPlugin({ name: pluginName, rootDirectory, entryPoint, uid });
      this.#state.setHealth(pluginName, 'crashed', PluginErrors.buildFailed(buildResult.errors));
      return;
    }

    this.#emitCompile(uid, pluginName, {
      phase: 'done',
      durationMs: Math.round(performance.now() - compileStart),
    });

    // Consent-before-code: the plugin is built above but must not EXECUTE until the operator has
    // reviewed its requested grants and enabled it. A first-time load of a grant-requesting plugin
    // (no state row) registers it dormant instead of spawning; enable() flips `enabled` and reloads
    // to start it. Precedence: a prior explicit choice (existingState.enabled) wins; else the caller's
    // `defaultEnabled` (install passes true for LOCAL/dev plugins, the operator's own code); else
    // dormant only when the plugin requests grants.
    const enabled = existingState?.enabled ?? defaultEnabled ?? !pluginRequestsGrants(metadata);
    if (!enabled) {
      await this.#registerDormant(pluginName, rootDirectory, entryPoint, uid, metadata);
      return;
    }

    this.#logs.info('Starting plugin', {
      pluginName,
      version: metadata.version,
      uid,
    });

    // Allocate per-plugin host dirs that back `/data`, `/cache`, `/tmp`.
    // `/bundle` is the plugin install dir, read-only. The L3 sandbox needs
    // to know about the writable ones so it doesn't block legitimate writes.
    const fsDirs = allocateFsDirs(this.#brikaInit.brikaDir, uid, rootDirectory);

    // L3 sandbox: wrap the bun command in the platform's launcher.
    // The launcher inspects the plugin's writable backing dirs and
    // emits an SBPL profile (macOS) / no-op (Linux + Windows pending
    // landlock/AppContainer) so the kernel refuses writes outside
    // scope even if L1+L2 break.
    // Derive kernel egress from grants (mirrors the raw-socket gate): a plugin
    // with no net/ws/dns grant gets IP traffic denied at the kernel, so a
    // grant-less plugin that escapes L1 still can't reach the network.
    const grantedPermissions = this.#state.getGrantedPermissions(pluginName);
    const allowNetwork = networkConsented(metadata.grants, grantedPermissions);

    const preludePath = await resolvePreludePath(this.#brikaInit.brikaDir);
    const sandboxPlan = this.#sandboxLauncher.wrap(
      this.#bunRunner.bin,
      [`--preload=${preludePath}`, buildResult.entryPath],
      {
        pluginUid: uid,
        readableDirs: [rootDirectory, fsDirs.data, fsDirs.cache, fsDirs.tmp],
        writableDirs: [rootDirectory, fsDirs.data, fsDirs.cache, fsDirs.tmp],
        allowNetwork,
      }
    );

    const rawSockets = rawSocketsConsented(metadata.grants, grantedPermissions);

    const channel = spawnPlugin(sandboxPlan.cmd, [...sandboxPlan.args], {
      cwd: rootDirectory,
      env: this.#bunRunner.pluginEnv({
        BRIKA_PLUGIN_NAME: metadata.name,
        BRIKA_PLUGIN_UID: uid,
        // Raw-socket capability: forwarded only when the plugin requests the
        // `dev.brika.net.socket` grant AND the operator consented to it. The
        // lockdown reads this at boot to keep UDP/TCP primitives intact.
        ...(rawSockets ? { BRIKA_PLUGIN_RAW_SOCKETS: '1' } : {}),
      }),
      processName: `brika:${metadata.name}`,
      defaultTimeoutMs: this.#config.callTimeoutMs,
      onDisconnect: (error) => this.#handleDisconnect(pluginName, error),
      onStderr: (line) =>
        this.#eventHandler.onPluginLog(pluginName, 'error', line, { source: 'stderr' }),
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
        fsDirs,
      },
      {
        heartbeatIntervalMs: this.#config.heartbeatEveryMs,
        heartbeatTimeoutMs: this.#config.heartbeatTimeoutMs,
        rssSoftLimitBytes: this.#config.rssSoftLimitBytes,
        rssBreachSamples: this.#config.rssBreachSamples,
      },
      {
        onReady: async (p) => {
          // Validate preferences before letting the plugin do real work.
          // On failure we transition to `awaiting-config` (not `crashed`)
          // so the UI can render a "Configure" CTA instead of a generic
          // error. The plugin process is gracefully unloaded; when the
          // operator submits valid preferences the lifecycle will boot
          // it again (see #autoStartOnPreferencesSave).
          const prefs = await this.#pluginConfig.getConfig(p.name);
          const validation = this.#pluginConfig.validate(p.name, prefs);
          if (!validation.success) {
            const errors = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            this.#logs.warn('Plugin awaiting valid configuration', {
              pluginName: p.name,
              errors,
            });
            this.#events.dispatch(
              PluginActions.configInvalid.create({ uid: p.uid, name: p.name, errors }, 'hub')
            );
            this.#state.setHealth(p.name, 'awaiting-config', PluginErrors.awaitingConfig(errors));
            // Graceful unload, no auto-restart.
            this.unload(p.name);
            return;
          }
          p.sendPreferences(prefs);
          this.#eventHandler.onPluginReady(p);
        },
        onLog: (level, msg, meta) =>
          this.#eventHandler.onPluginLog(pluginName, level as LogLevelType, msg, meta),
        onCapture: (name, props, distinctId) =>
          this.#eventHandler.onPluginCapture(pluginName, name, props, distinctId),
        onBlock: (block) => this.#eventHandler.registerBlock(metadata.name, block, metadata),
        onBlockEmit: (instanceId, port, data, causationId) =>
          this.#eventHandler.onBlockEmit(instanceId, port, data, causationId),
        onBlockLog: (instanceId, workflowId, level, message, data) =>
          this.#eventHandler.onBlockLog(instanceId, workflowId, level, message, data),
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
          this.#eventHandler.registerBrickType(metadata.name, brickType, manifest, uid);
        },
        onBrickDataPush: (brickTypeId, data) =>
          this.#eventHandler.pushBrickData(metadata.name, brickTypeId, data),
        onRoute: (method, path) => this.#eventHandler.registerRoute(metadata.name, method, path),
        onRegisterTool: (tool) =>
          // Re-resolve the live process per call instead of capturing this
          // one: scale-to-zero may have reaped it since registration, so we
          // respawn on demand and never invoke a dead process.
          this.#tools.register(metadata.name, tool, async (args, ctx) => {
            const live = await this.ensureStarted(metadata.name);
            if (!live) {
              return { ok: false, content: `Plugin not available: ${metadata.name}` };
            }
            return live.callPluginTool(tool.id, args, ctx);
          }),
        onInvokeTool: (tool, args) =>
          this.#tools.call(tool, args, { traceId: crypto.randomUUID(), source: 'automation' }),
        onListTools: () => this.#tools.list(),
        onUpdatePreference: async (key, value) => {
          const current = await this.#pluginConfig.getConfig(metadata.name);
          await this.#pluginConfig.setConfig(metadata.name, {
            ...current,
            [key]: value,
          });
        },
        onGetHubLocation: () => this.#state.getHubLocation(),
        onGetHubTimezone: () => this.#state.getHubTimezone(),
        onGetGrantedPermissions: (name) => this.#state.getGrantedPermissions(name),
        onGetPluginSecret: (name, key) => this.#secrets.get(name, this.#userSecretKey(key)),
        onSetPluginSecret: async (name, key, value) => {
          const ns = this.#userSecretKey(key);
          if (value === '') {
            await this.#secrets.delete(name, ns);
            return;
          }
          await this.#secrets.set(name, ns, value);
        },
        onDeletePluginSecret: (name, key) => this.#secrets.delete(name, this.#userSecretKey(key)),
        onHeartbeatFailed: (p, silentMs) => this.#handleHeartbeatFailed(p, silentMs),
        onDisconnect: (p, error) => this.#handleDisconnect(p.name, error),
        onMetrics: (p, cpu, memory) => {
          this.#metrics.record(p.name, {
            ts: Date.now(),
            cpu,
            memory,
          });
        },
        onRssSoftLimitBreached: (p, rssBytes, limitBytes) =>
          this.#handleRssSoftLimitBreached(p, rssBytes, limitBytes),
      }
    );

    this.#processes.set(pluginName, process);
    this.#uidIndex.set(uid, pluginName);

    // Register brick types from manifest with the uid baked in,
    // so the UI can build module URLs without a process lookup.
    const bricks = metadata.bricks ?? [];
    for (const brick of bricks) {
      this.#eventHandler.registerBrickType(
        metadata.name,
        { id: brick.id, families: brick.families ?? ['sm', 'md', 'lg'] },
        brick,
        uid
      );
    }

    this.#startStabilityCheck(process);
    this.#restartPolicy.onStart(pluginName);

    await this.#state.registerPlugin({
      name: pluginName,
      rootDirectory,
      entryPoint,
      uid,
    });
    this.#state.setHealth(pluginName, 'restarting');

    this.#watcher.watch(pluginName, rootDirectory);
  }

  unload(name: string, skipRestartReset = false): Promise<void> {
    return this.#serialize(name, () => this.#unloadInner(name, skipRestartReset));
  }

  async #unloadInner(name: string, skipRestartReset = false): Promise<void> {
    const process = this.#processes.get(name);
    if (!process) {
      return;
    }

    this.#processes.delete(name);
    this.#uidIndex.delete(process.uid);
    this.#watcher.unwatch(name);

    const timer = this.#stabilityTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.#stabilityTimers.delete(name);
    }

    process.stop();
    // Wait for the process to exit gracefully; force-kill if it doesn't within the timeout.
    const exited = await Promise.race([
      process.exited.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), this.#config.killTimeoutMs)),
    ]);
    if (!exited) {
      process.kill();
    }

    // Clear runtime metrics (compiled modules are preserved for client-side bricks)
    this.#metrics.clear(name);

    // Unregister the plugin's blocks so consumers learn the handlers are gone.
    // The workflow engine listens for this to pause running workflows whose
    // triggers lived in the dead process and re-arm them when the plugin (and
    // its blocks) come back; without it, a reload left workflows subscribed to
    // nothing, looking alive but never firing again.
    this.#blockRegistry.unregisterPlugin(name);

    const restartState = this.#restartPolicy.getState(name);
    this.#state.setHealth(name, restartState?.pendingTimer ? 'restarting' : 'stopped');

    if (!skipRestartReset) {
      this.#restartPolicy.reset(name);
    }

    this.#logs.info('Plugin unloaded successfully', {
      pluginName: name,
    });
    this.#analytics.capture('plugin.unloaded', { uid: process.uid }, { pluginName: process.name });
    this.#events.dispatch(
      PluginActions.unloaded.create(
        {
          uid: process.uid,
          name: process.name,
        },
        'hub'
      )
    );
  }

  /**
   * Reap an idle plugin: stop its process but keep it enabled and its blocks
   * registered, so the next event respawns it ({@link ensureStarted}) and the
   * editor palette / routing never lose the block types. Distinct from
   * {@link unload}, which is a full teardown (unregisters blocks, resets the
   * crash backoff) for an operator-initiated stop/disable. Serialized per
   * plugin so it cannot interleave with a concurrent load/unload.
   */
  #reap(name: string): Promise<void> {
    return this.#serialize(name, () => this.#reapInner(name));
  }

  async #reapInner(name: string): Promise<void> {
    const process = this.#processes.get(name);
    if (!process) {
      return;
    }
    // Re-check eligibility under the op lock: a workflow may have started
    // owning this plugin (guard now pins it), or it may have done work, between
    // the sweep's decision and this point. Never reap a freshly-active/pinned
    // plugin.
    if (!this.#reaper.reapable().includes(name)) {
      return;
    }

    // Capture observability data while the process is still in hand; the rest
    // of this method tears it down.
    const uid = process.uid;
    const idleMs = Date.now() - process.lastActivityAt;

    this.#processes.delete(name);
    this.#uidIndex.delete(process.uid);
    this.#watcher.unwatch(name);

    const timer = this.#stabilityTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.#stabilityTimers.delete(name);
    }

    process.stop();
    const exited = await Promise.race([
      process.exited.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), this.#config.killTimeoutMs)),
    ]);
    if (!exited) {
      process.kill();
    }

    this.#metrics.clear(name);
    // Deliberately NOT unregistering the plugin's blocks: they stay registered
    // so the palette and routing survive and ensureStarted can respawn lazily.
    // Deliberately NOT touching the restart policy: reaping is intentional, not
    // a crash, and must not consume the crash budget.
    this.#state.setHealth(name, 'stopped');
    this.#logs.info('Reaped idle plugin (scale-to-zero)', { pluginName: name, idleMs });
    this.#analytics.capture('plugin.reaped', { uid, idleMs }, { pluginName: name });
  }

  /** Remove compiled modules from cache (in-memory + disk). */
  removeModules(name: string, rootDirectory?: string): void {
    this.#moduleCompiler.remove(name, rootDirectory);
  }

  /** Dispatch moduleRecompiled events for bricks of a plugin. */
  /**
   * Namespaces SDK programmatic secrets under `user.*` so they cannot collide
   * with declared password preferences or `__secret_*` SDK-internal keys
   * (e.g. OAuth tokens). The prefix is enforced hub-side; plugins cannot
   * escape it because they never see this method.
   */
  #userSecretKey(key: string): string {
    return `user.${key}`;
  }

  #emitModuleRecompiled(pluginName: string): void {
    const process = this.#processes.get(pluginName);
    if (!process) {
      return;
    }
    // Only board bricks live-swap in place; pages and block views reload on
    // navigation, so this stays brick-scoped (a genuine semantic difference,
    // not duplication). URL/key shapes come from the registry so they cannot
    // drift from the serving route.
    for (const id of MODULE_KINDS.brick.select(process.metadata)) {
      const moduleUrl = resolveModuleUrl(
        this.#moduleCompiler,
        pluginName,
        process.uid,
        MODULE_KINDS.brick,
        id
      );
      if (!moduleUrl) {
        continue;
      }
      this.#events.dispatch(
        BrickActions.moduleRecompiled.create(
          { pluginName, brickTypeId: `${pluginName}:${id}`, moduleUrl },
          'hub'
        )
      );
    }
  }

  async stopAll(): Promise<void> {
    this.#reaper.stop();
    this.#watcher.stopAll();
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
            {
              error: e,
            }
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
        this.#moduleCompiler.remove(state.name, state.rootDirectory);
        this.#state.remove(state.name);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Private - Restart & Error Handling
  // ───────────────────────────────────────────────────────────────────────

  #handleHeartbeatFailed(process: PluginProcessInstance, silentMs: number): void {
    this.#logs.error('Plugin heartbeat timeout', {
      pluginName: process.name,
      pid: process.pid,
      silentMs,
      timeoutMs: this.#config.heartbeatTimeoutMs,
    });

    this.#analytics.capture(
      'plugin.crashed',
      { uid: process.uid, reason: 'heartbeat_timeout', silentMs },
      { pluginName: process.name }
    );
    this.#state.setHealth(process.name, 'crashed', PluginErrors.heartbeatTimeout());
    this.#eventHandler.onPluginDisconnected(process.name);
    this.#tools.unregisterPlugin(process.name);
    this.unload(process.name, true)
      .then(() => this.#attemptAutoRestart(process.name, 'heartbeat timeout'))
      .catch((e) =>
        this.#logs.error(
          'Failed to unload after heartbeat timeout',
          { pluginName: process.name },
          { error: e }
        )
      );
  }

  /**
   * A plugin's RSS stayed above its soft-limit for the required number of
   * consecutive samples. Emit a log + plugin event, then funnel through the
   * normal crash path so the graceful restart respects RestartPolicy backoff
   * and crash-loop counting (a leaking plugin that keeps tripping the limit
   * is treated like a crash loop and eventually parked).
   */
  #handleRssSoftLimitBreached(
    process: PluginProcessInstance,
    rssBytes: number,
    limitBytes: number
  ): void {
    this.#eventHandler.onRssSoftLimitBreached(process.uid, process.name, rssBytes, limitBytes);

    this.#analytics.capture(
      'plugin.rss_restarted',
      { uid: process.uid, rssBytes, limitBytes },
      { pluginName: process.name }
    );

    this.#state.setHealth(process.name, 'crashed', PluginErrors.rssSoftLimit(rssBytes, limitBytes));

    const reason = `RSS soft-limit exceeded (${rssBytes} > ${limitBytes} bytes)`;
    this.unload(process.name, true)
      .then(() => this.#attemptAutoRestart(process.name, reason))
      .catch((e) =>
        this.#logs.error(
          'Failed to unload after RSS soft-limit breach',
          { pluginName: process.name },
          { error: e }
        )
      );
  }

  #handleDisconnect(name: string, error?: Error): void {
    const process = this.#processes.get(name);
    if (!process) {
      return;
    }

    const reason = error?.message ?? 'disconnected';
    this.#logs.error(
      'Plugin crashed unexpectedly',
      {
        pluginName: name,
        pid: process.pid,
        reason,
      },
      {
        error,
      }
    );
    this.#analytics.capture(
      'plugin.crashed',
      { uid: process.uid, reason: 'disconnected' },
      { pluginName: process.name }
    );
    this.#state.setHealth(name, 'crashed', PluginErrors.crashed(reason));
    this.#eventHandler.onPluginDisconnected(name);
    this.#tools.unregisterPlugin(name);

    this.#events.dispatch(
      PluginActions.error.create(
        {
          uid: process.uid,
          name: process.name,
          error: reason,
        },
        'hub'
      )
    );

    this.unload(name, true)
      .then(() => this.#attemptAutoRestart(name, reason))
      .catch((e) =>
        this.#logs.error('Failed to unload crashed plugin', { pluginName: name }, { error: e })
      );
  }

  #attemptAutoRestart(name: string, reason: string): void {
    if (!this.#config.autoRestartEnabled) {
      return;
    }

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
      this.#analytics.capture(
        'plugin.crash_loop',
        { uid: this.#state.get(name)?.uid },
        { pluginName: name }
      );
      this.#state.setHealth(name, 'crash-loop', PluginErrors.crashLoop(decision.reason));
      return;
    }

    this.#logs.info('Plugin restart scheduled', {
      pluginName: name,
      delayMs: decision.delayMs,
      reason,
    });
    this.#state.setHealth(name, 'restarting', PluginErrors.restarting(decision.delayMs));

    const rootDirectory = pluginState.rootDirectory;
    this.#restartPolicy.scheduleRestart(name, decision.delayMs, async () => {
      try {
        this.#logs.info('Attempting to restart plugin', {
          pluginName: name,
        });
        await this.load(rootDirectory);
        this.#logs.info('Plugin restarted successfully', {
          pluginName: name,
        });
      } catch (e) {
        this.#logs.error(
          'Failed to restart plugin',
          {
            pluginName: name,
          },
          {
            error: e,
          }
        );
      }
    });
  }

  #startStabilityCheck(process: PluginProcessInstance): void {
    // Clear any existing timer to prevent leaks on rapid restarts
    const existing = this.#stabilityTimers.get(process.name);
    if (existing) {
      clearInterval(existing);
    }

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

  #checkCompatibility(metadata: {
    name: string;
    engines?: {
      brika?: string;
    };
  }): boolean {
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

  /**
   * Register a plugin in state WITHOUT spawning it (consent-before-code). The
   * installed-but-not-yet-enabled plugin is recorded (enabled:false, health
   * 'stopped') so it appears in the UI for grant review, but none of its code
   * runs until the operator enables it. Mirrors {@link #registerIncompatible}.
   */
  async #registerDormant(
    pluginName: string,
    rootDirectory: string,
    entryPoint: string,
    uid: string,
    metadata: { name: string }
  ): Promise<void> {
    await this.#state.registerPlugin({
      name: pluginName,
      rootDirectory,
      entryPoint,
      uid,
      enabled: false,
    });
    await this.#i18n.registerPluginTranslations(metadata.name, rootDirectory);
    this.#state.setHealth(pluginName, 'stopped');
    this.#logs.info('Plugin installed but not started: awaiting operator consent', {
      pluginName,
      uid,
    });
  }

  async #registerIncompatible(
    pluginName: string,
    rootDirectory: string,
    entryPoint: string,
    metadata: { name: string; engines?: { brika?: string } }
  ): Promise<void> {
    const existingUid = this.#state.get(pluginName)?.uid ?? generateUid(metadata.name);
    await this.#state.registerPlugin({
      name: pluginName,
      rootDirectory,
      entryPoint,
      uid: existingUid,
      enabled: false,
    });
    await this.#i18n.registerPluginTranslations(metadata.name, rootDirectory);
    const required = metadata.engines?.brika;
    this.#analytics.capture(
      'plugin.incompatible',
      { uid: existingUid, hubVersion: HUB_VERSION, hasRequirement: required !== undefined },
      { pluginName }
    );
    this.#state.setHealth(
      pluginName,
      'incompatible',
      required ? PluginErrors.incompatibleVersion(required) : PluginErrors.incompatibleUnknown()
    );
  }

  async #compilePluginModules(
    metadata: PluginPackageSchema,
    rootDirectory: string
  ): Promise<CompileSummary> {
    const summary = await this.#moduleCompiler.syncManifest(metadata.name, rootDirectory, metadata);
    await ensurePluginTsconfig(rootDirectory);
    return summary;
  }

  /** Dispatch a `plugin.compile` build-progress event onto the hub event bus. */
  #emitCompile(
    uid: string,
    name: string,
    fields: Omit<ReturnType<typeof PluginActions.compile.create>['payload'], 'uid' | 'name'>
  ): void {
    this.#events.dispatch(PluginActions.compile.create({ uid, name, ...fields }, 'hub'));
  }

  /**
   * Run a build step, emitting a terminal `compile` error event if it throws so
   * the UI's progress indicator never hangs on an unexpected failure (a build
   * failure that returns a result rather than throwing is reported by the
   * caller). The error is re-thrown for the normal load-failure handling.
   */
  async #guardCompile<T>(uid: string, name: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.#emitCompile(uid, name, {
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/** Compute the list of packages to mark as external in the server build. */
function computeServerExternals(metadata: PluginPackageSchema): string[] {
  const externals: string[] = ['@brika/*'];
  for (const dep of Object.keys(metadata.dependencies ?? {})) {
    if (!dep.startsWith('@brika/')) {
      externals.push(dep);
    }
  }
  for (const dep of Object.keys(metadata.peerDependencies ?? {})) {
    externals.push(dep);
  }
  return externals;
}
