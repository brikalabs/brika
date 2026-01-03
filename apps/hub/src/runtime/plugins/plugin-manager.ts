import { singleton, inject } from "@elia/shared";
import { spawnPlugin, type PluginChannel, type Json } from "@elia/ipc";
import {
  hello,
  ready,
  log,
  registerTool,
  registerBlock,
  callTool,
  executeBlock,
  emit,
  subscribe,
  event,
  type ToolResult,
  type BlockResult,
  type BlockContext,
  type ToolCallContext,
} from "@elia/ipc/contract";
import type { Plugin, PluginManifest } from "@elia/shared";
import { ToolRegistry } from "../tools/tool-registry";
import { LogRouter } from "../logs/log-router";
import { StoreService } from "../store/store-service";
import { StateStore } from "../state/state-store";
import { EventBus } from "../events/event-bus";
import { PluginManagerConfig } from "../config";
import { BlockRegistry } from "../blocks";
import { RestartPolicy } from "./restart-policy";
import { I18nService } from "../i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────────────────────

interface RunningPlugin {
  ref: string;
  dir: string;
  pid: number;
  channel: PluginChannel;
  tools: Set<string>;
  blocks: Set<string>;
  subscriptions: Set<string>;
  eventUnsubs: Array<() => void>;
  lastPong: number;
  heartbeat?: Timer;
  name: string;
  uid: string;
  version: string;
  metadata: PluginManifest;
  startedAt: number;
  /** Available translation locales */
  locales: string[];
}

function now(): number {
  return Date.now();
}

/**
 * Generate a deterministic UID from the plugin name.
 * Uses Bun.hash (64-bit) converted to base36 for a stable, URL-safe identifier.
 */
function generateUid(pluginName: string): string {
  const hash = Bun.hash(pluginName);
  return hash.toString(36);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Manager
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class PluginManager {
  readonly #opts = inject(PluginManagerConfig);
  readonly #tools = inject(ToolRegistry);
  readonly #blocks = inject(BlockRegistry);
  readonly #logs = inject(LogRouter);
  readonly #store = inject(StoreService);
  readonly #state = inject(StateStore);
  readonly #events = inject(EventBus);
  readonly #i18n = inject(I18nService);

  /** Running plugins keyed by ref */
  readonly #plugins = new Map<string, RunningPlugin>();
  readonly #restartPolicy: RestartPolicy;
  readonly #stabilityTimers = new Map<string, Timer>();

  constructor() {
    this.#restartPolicy = new RestartPolicy({
      baseDelayMs: this.#opts.restartBaseDelayMs,
      maxDelayMs: this.#opts.restartMaxDelayMs,
      maxCrashes: this.#opts.restartMaxCrashes,
      crashWindowMs: this.#opts.restartCrashWindowMs,
      stabilityThresholdMs: this.#opts.restartStabilityMs,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API - Simplified
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a plugin by UID (primary identifier).
   * Works for both running and stopped plugins.
   */
  get(uid: string): Plugin | null {
    // Check running plugins first
    const running = this.#findByUid(uid);
    if (running) {
      return this.#toPlugin(running, "running");
    }

    // Fallback to state store for stopped/crashed plugins
    const stored = this.#state.getByUid(uid);
    if (stored) {
      const restartState = this.#restartPolicy.getState(stored.ref);
      const status = restartState?.pendingTimer ? "restarting" : this.#healthToStatus(stored.health);
      return this.#fromStored(stored, status);
    }

    return null;
  }

  /**
   * List all known plugins (running + stopped).
   */
  list(): Plugin[] {
    const out: Plugin[] = [];
    const seenRefs = new Set<string>();

    // Add running plugins
    for (const p of this.#plugins.values()) {
      seenRefs.add(p.ref);
      out.push(this.#toPlugin(p, "running"));
    }

    // Add non-running plugins from state
    for (const s of this.#state.listInstalled()) {
      if (!seenRefs.has(s.ref)) {
        const restartState = this.#restartPolicy.getState(s.ref);
        const status = restartState?.pendingTimer ? "restarting" : this.#healthToStatus(s.health);
        out.push(this.#fromStored(s, status));
      }
    }

    return out;
  }

  /**
   * Resolve a ref to a UID (for loading by ref).
   */
  resolve(ref: string): string | null {
    const running = this.#plugins.get(ref);
    if (running) return running.uid;

    const stored = this.#state.get(ref);
    return stored?.uid ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle Operations (by UID)
  // ─────────────────────────────────────────────────────────────────────────

  async enable(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);
    await this.#state.setEnabled(ref, true);
    await this.load(ref);
  }

  async disable(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);
    await this.#state.setEnabled(ref, false);
    await this.unload(ref);
  }

  async reload(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);
    await this.unload(ref);
    await this.load(ref);
  }

  async kill(uid: string): Promise<void> {
    const ref = this.#getRef(uid);
    if (!ref) throw new Error(`Plugin not found: ${uid}`);
    const p = this.#plugins.get(ref);
    if (!p) return;
    p.channel.kill(9);
    await this.#state.setHealth(ref, "crashed", "killed");
    await this.unload(ref);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin Loading
  // ─────────────────────────────────────────────────────────────────────────

  async restoreEnabledFromState(): Promise<void> {
    for (const p of this.#state.listInstalled()) {
      if (p.enabled) {
        try {
          await this.load(p.ref);
        } catch (e) {
          this.#logs.error("plugin.restore.error", { ref: p.ref, error: String(e) });
        }
      }
    }
  }

  async load(ref: string): Promise<void> {
    if (this.#plugins.has(ref)) return;
    const entry = ref.startsWith("file:") ? this.#fileRefToPath(ref) : this.#store.resolveEntry(ref);
    if (!entry) throw new Error(`Cannot resolve plugin: ${ref}`);

    const pluginDir = entry.substring(0, entry.lastIndexOf("/")).replace(/\/src$/, "");
    const metadata = await this.#readPackageJson(pluginDir);
    const pluginName = metadata.name;

    // Spawn plugin with native IPC
    const channel = spawnPlugin("bun", [entry], {
      cwd: process.cwd(),
      env: { ...process.env, ELIA_PLUGIN_REF: ref, ELIA_PLUGIN_NAME: pluginName },
      defaultTimeoutMs: this.#opts.callTimeoutMs,
      onDisconnect: (error) => this.#handleDisconnect(ref, error),
      onStderr: (line) => this.#logs.error("plugin.stderr", { name: pluginName, message: line }),
    });

    // Use existing UID from state if available, otherwise generate deterministic one
    const existingState = this.#state.get(ref);
    const uid = existingState?.uid ?? generateUid(pluginName);

    // Register plugin translations and detect available locales
    const locales = await this.#i18n.registerPluginTranslations(pluginName, pluginDir);

    const plugin: RunningPlugin = {
      ref,
      dir: pluginDir,
      pid: channel.pid,
      channel,
      tools: new Set(),
      blocks: new Set(),
      subscriptions: new Set(),
      eventUnsubs: [],
      lastPong: now(),
      name: pluginName,
      uid,
      version: metadata.version,
      metadata,
      startedAt: now(),
      locales,
    };

    this.#setupHandlers(plugin);
    this.#plugins.set(ref, plugin);
    this.#startHeartbeat(plugin);
    this.#startStabilityCheck(plugin);
    this.#restartPolicy.onStart(ref);

    await this.#state.registerPlugin({
      ref,
      dir: pluginDir,
      name: pluginName,
      uid,
      version: metadata.version,
      metadata,
    });

    this.#logs.info("plugin.loaded", {
      ref,
      name: pluginName,
      uid,
      version: metadata.version,
      pid: channel.pid,
    });
  }

  async unload(ref: string, skipRestartReset = false): Promise<void> {
    const p = this.#plugins.get(ref);
    if (!p) return;

    if (p.heartbeat) clearInterval(p.heartbeat);
    for (const unsub of p.eventUnsubs) unsub();

    const stabilityTimer = this.#stabilityTimers.get(ref);
    if (stabilityTimer) {
      clearInterval(stabilityTimer);
      this.#stabilityTimers.delete(ref);
    }

    p.channel.stop();
    await new Promise((r) => setTimeout(r, 50));
    p.channel.kill();

    this.#tools.unregisterByOwner(p.name);
    this.#blocks.unregisterPlugin(p.name);
    this.#i18n.unregisterPluginTranslations(p.name);
    this.#plugins.delete(ref);

    if (!skipRestartReset) {
      this.#restartPolicy.reset(ref);
    }
    this.#logs.info("plugin.unloaded", { ref, name: p.name });
  }

  async stopAll(): Promise<void> {
    for (const ref of this.#plugins.keys()) await this.unload(ref);
  }

  async cleanupStaleState(): Promise<void> {
    for (const s of this.#state.listInstalled()) {
      if (s.ref.startsWith("file:")) {
        const filePath = s.ref.slice("file:".length);
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          this.#logs.debug("plugin.state.cleanup", { ref: s.ref, reason: "file not found" });
          await this.#state.remove(s.ref);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tool & Block Execution
  // ─────────────────────────────────────────────────────────────────────────

  async callTool(
    ref: string,
    toolName: string,
    args: Record<string, Json>,
    ctx: ToolCallContext,
  ): Promise<ToolResult> {
    const p = this.#plugins.get(ref);
    if (!p) return { ok: false, content: `Plugin not loaded: ${ref}` };

    try {
      return await p.channel.call(callTool, { tool: toolName, args, ctx });
    } catch (e) {
      return { ok: false, content: String(e) };
    }
  }

  async executeBlock(
    blockType: string,
    config: Record<string, Json>,
    context: BlockContext,
  ): Promise<BlockResult> {
    const pluginName = this.#blocks.getProvider(blockType);
    if (!pluginName) return { error: `Unknown block type: ${blockType}`, stop: true };

    const p = this.#findByName(pluginName);
    if (!p) return { error: `Plugin not loaded: ${pluginName}`, stop: true };

    const localBlockId = blockType.includes(":") ? blockType.split(":")[1] : blockType;

    try {
      return await p.channel.call(executeBlock, { blockType: localBlockId, config, context });
    } catch (e) {
      return { error: String(e), stop: true };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  #findByUid(uid: string): RunningPlugin | undefined {
    for (const p of this.#plugins.values()) {
      if (p.uid === uid) return p;
    }
    return undefined;
  }

  #findByName(name: string): RunningPlugin | undefined {
    for (const p of this.#plugins.values()) {
      if (p.name === name) return p;
    }
    return undefined;
  }

  #getRef(uid: string): string | null {
    const running = this.#findByUid(uid);
    if (running) return running.ref;

    const stored = this.#state.getByUid(uid);
    return stored?.ref ?? null;
  }

  #toPlugin(p: RunningPlugin, status: Plugin["status"]): Plugin {
    const m = p.metadata;
    return {
      uid: p.uid,
      name: p.name,
      version: p.version,
      description: m.description ?? null,
      author: m.author ?? null,
      repository: m.repository ?? null,
      icon: m.icon ?? null,
      keywords: m.keywords ?? [],
      license: m.license ?? null,
      ref: p.ref,
      dir: p.dir,
      status,
      pid: p.pid,
      startedAt: p.startedAt,
      lastError: null,
      tools: m.tools ?? [],
      blocks: m.blocks ?? [],
      locales: p.locales,
    };
  }

  #fromStored(
    s: {
      uid: string;
      ref: string;
      dir: string;
      name: string;
      version: string;
      metadata: PluginManifest;
      lastError: string | null;
      locales?: string[];
    },
    status: Plugin["status"],
  ): Plugin {
    const m = s.metadata;
    return {
      uid: s.uid,
      name: s.name,
      version: s.version,
      description: m.description ?? null,
      author: m.author ?? null,
      repository: m.repository ?? null,
      icon: m.icon ?? null,
      keywords: m.keywords ?? [],
      license: m.license ?? null,
      ref: s.ref,
      dir: s.dir,
      status,
      pid: null,
      startedAt: null,
      lastError: s.lastError,
      tools: m.tools ?? [],
      blocks: m.blocks ?? [],
      locales: s.locales ?? [],
    };
  }

  #healthToStatus(health: string): Plugin["status"] {
    switch (health) {
      case "running":
        return "running";
      case "crashed":
      case "crash-loop":
        return "crashed";
      case "restarting":
        return "restarting";
      default:
        return "stopped";
    }
  }

  #setupHandlers(p: RunningPlugin): void {
    p.channel.on(hello, ({ plugin: info }) => {
      this.#logs.debug("plugin.hello", { declaredName: info.id, actualName: p.name, version: info.version });
    });

    p.channel.on(ready, () => {
      this.#logs.debug("plugin.ready", { name: p.name });
    });

    p.channel.on(log, ({ level, message, meta }) => {
      this.#logs.emit({ ts: now(), level, source: "plugin", pluginRef: p.ref, message, meta });
    });

    p.channel.on(registerTool, ({ tool }) => {
      const fullName = `${p.name}:${tool.id}`;

      // Validate against manifest
      const declared = p.metadata.tools?.find((t) => t.id === tool.id);
      if (!declared) {
        this.#logs.warn("plugin.tool.undeclared", { plugin: p.name, tool: tool.id });
        return;
      }

      p.tools.add(fullName);
      this.#tools.register(tool.id, p.name, {
        description: tool.description ?? declared.description,
        icon: declared.icon ?? tool.icon,
        color: declared.color ?? tool.color,
        inputSchema: tool.inputSchema,
        call: (args, ctx) => this.callTool(p.ref, tool.id, args, ctx),
      });
      this.#logs.debug("plugin.tool.registered", { tool: fullName, plugin: p.name });
    });

    p.channel.on(registerBlock, ({ block }) => {
      const fullName = `${p.name}:${block.id}`;

      // Validate against manifest
      const declared = p.metadata.blocks?.find((b) => b.id === block.id);
      if (!declared) {
        this.#logs.warn("plugin.block.undeclared", { plugin: p.name, block: block.id });
        return;
      }

      p.blocks.add(fullName);
      // biome-ignore lint/suspicious/noExplicitAny: IPC and SDK types are structurally compatible
      this.#blocks.register(block as any, p.name);
      this.#logs.debug("plugin.block.registered", { block: fullName, plugin: p.name });
    });

    p.channel.on(emit, ({ eventType, payload }) => {
      this.#events.emit(eventType, p.ref, payload);
    });

    p.channel.on(subscribe, ({ patterns }) => {
      for (const pattern of patterns) {
        if (!p.subscriptions.has(pattern)) {
          p.subscriptions.add(pattern);
          p.eventUnsubs.push(
            this.#events.subscribe(pattern, (e) => {
              p.channel.send(event, { event: e });
            }),
          );
        }
      }
    });
  }

  #handleDisconnect(ref: string, error?: Error): void {
    const p = this.#plugins.get(ref);
    if (!p) return;

    const reason = error?.message ?? "disconnected";
    this.#logs.error("plugin.crashed", { ref: p.ref, name: p.name, pid: p.pid, reason });
    this.#state.setHealth(p.ref, "crashed", reason);
    this.unload(p.ref, true);
    this.#attemptAutoRestart(p.ref, reason);
  }

  async #readPackageJson(pluginDir: string): Promise<PluginManifest> {
    const pkgPath = `${pluginDir}/package.json`;
    try {
      const file = Bun.file(pkgPath);
      const pkg = await file.json();
      const basename = pluginDir.substring(pluginDir.lastIndexOf("/") + 1);
      return {
        name: pkg.name || basename,
        version: pkg.version || "0.0.0",
        description: pkg.description,
        author: pkg.author,
        repository: pkg.repository,
        icon: pkg.icon,
        keywords: pkg.keywords,
        license: pkg.license,
        dependencies: pkg.dependencies,
        tools: pkg.tools,
        blocks: pkg.blocks,
      };
    } catch (e) {
      this.#logs.warn("plugin.package.error", { dir: pluginDir, error: String(e) });
      const basename = pluginDir.substring(pluginDir.lastIndexOf("/") + 1);
      return { name: basename, version: "0.0.0" };
    }
  }

  #fileRefToPath(ref: string): string {
    const p = ref.slice("file:".length);
    return p.startsWith("/") ? p : `${process.cwd()}/${p}`;
  }

  #startHeartbeat(p: RunningPlugin): void {
    this.#logs.info("plugin.heartbeat.started", { name: p.name, intervalMs: this.#opts.heartbeatEveryMs });
    p.heartbeat = setInterval(async () => {
      try {
        await p.channel.ping(this.#opts.heartbeatTimeoutMs);
        p.lastPong = now();
      } catch {
        const silentMs = now() - p.lastPong;
        this.#logs.error("plugin.heartbeat.missed", {
          ref: p.ref,
          name: p.name,
          pid: p.pid,
          silentMs,
          timeoutMs: this.#opts.heartbeatTimeoutMs,
        });
        this.kill(p.uid).catch(() => {});
      }
    }, this.#opts.heartbeatEveryMs);
  }

  #startStabilityCheck(p: RunningPlugin): void {
    const timer = setInterval(() => {
      if (this.#restartPolicy.checkStability(p.ref)) {
        this.#logs.debug("plugin.stable", {
          ref: p.ref,
          name: p.name,
          thresholdMs: this.#opts.restartStabilityMs,
        });
        clearInterval(timer);
        this.#stabilityTimers.delete(p.ref);
      }
    }, 5000);
    this.#stabilityTimers.set(p.ref, timer);
  }

  #attemptAutoRestart(ref: string, reason: string): void {
    if (!this.#opts.autoRestartEnabled) return;

    const pluginState = this.#state.get(ref);
    if (!pluginState?.enabled) {
      this.#logs.debug("plugin.restart.skip", { ref, reason: "plugin disabled" });
      return;
    }

    const decision = this.#restartPolicy.onCrash(ref);

    if (decision.action === "crash-loop") {
      this.#logs.error("plugin.crash-loop", { ref, reason: decision.reason });
      this.#state.setHealth(ref, "crash-loop", `Crash loop detected: ${decision.reason}`);
      return;
    }

    this.#logs.info("plugin.restart.scheduled", { ref, delayMs: decision.delayMs, crashReason: reason });
    this.#state.setHealth(ref, "restarting", `Restarting in ${Math.round(decision.delayMs / 1000)}s`);

    this.#restartPolicy.scheduleRestart(ref, decision.delayMs, async () => {
      try {
        this.#logs.info("plugin.restart.attempting", { ref });
        await this.load(ref);
        this.#logs.info("plugin.restart.success", { ref });
      } catch (e) {
        this.#logs.error("plugin.restart.failed", { ref, error: String(e) });
      }
    });
  }
}
