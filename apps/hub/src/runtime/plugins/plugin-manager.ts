import { singleton, inject } from "@elia/shared";
import { FrameReader, FrameWriter, type Wire, type BlockContext, type BlockResult } from "@elia/sdk";
import type { Json, PluginSummary, PluginMetadata, ToolCallContext, ToolResult } from "@elia/shared";
import { ToolRegistry } from "../tools/tool-registry";
import { LogRouter } from "../logs/log-router";
import { StoreService } from "../store/store-service";
import { StateStore } from "../state/state-store";
import { EventBus } from "../events/event-bus";
import { PluginManagerConfig } from "../config";
import { BlockRegistry } from "../blocks";
import { RestartPolicy } from "./restart-policy";

type PendingTool = { resolve: (v: ToolResult) => void; reject: (e: Error) => void; timer: Timer };
type PendingBlock = { resolve: (v: BlockResult) => void; reject: (e: Error) => void; timer: Timer };
type RunningPlugin = {
  ref: string;
  /** Plugin directory path */
  dir: string;
  pid: number;
  proc: ReturnType<typeof Bun.spawn>;
  reader: FrameReader;
  writer: FrameWriter;
  tools: Set<string>;
  blocks: Set<string>;
  subscriptions: Set<string>;
  eventUnsubs: Array<() => void>;
  lastPong: number;
  heartbeat?: Timer;
  nextCallId: number;
  pendingTools: Map<number, PendingTool>;
  pendingBlocks: Map<number, PendingBlock>;
  /** Plugin ID from package.json name (human-readable) */
  id: string;
  /** Short unique ID for URLs */
  uid: string;
  /** Plugin version */
  version?: string;
  /** Full metadata from package.json */
  metadata: PluginMetadata;
};

function now(): number {
  return Date.now();
}

/** Generate a short alphanumeric uid */
function generateUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

@singleton()
export class PluginManager {
  private readonly opts = inject(PluginManagerConfig);
  private readonly tools = inject(ToolRegistry);
  private readonly blocks = inject(BlockRegistry);
  private readonly logs = inject(LogRouter);
  private readonly store = inject(StoreService);
  private readonly state = inject(StateStore);
  private readonly events = inject(EventBus);
  readonly #byRef = new Map<string, RunningPlugin>();
  readonly #idToRef = new Map<string, string>(); // pluginId -> installation ref
  readonly #uidToRef = new Map<string, string>(); // uid -> installation ref
  readonly #restartPolicy: RestartPolicy;
  readonly #stabilityTimers = new Map<string, Timer>();

  constructor() {
    this.#restartPolicy = new RestartPolicy({
      baseDelayMs: this.opts.restartBaseDelayMs,
      maxDelayMs: this.opts.restartMaxDelayMs,
      maxCrashes: this.opts.restartMaxCrashes,
      crashWindowMs: this.opts.restartCrashWindowMs,
      stabilityThresholdMs: this.opts.restartStabilityMs,
    });
  }

  async restoreEnabledFromState(): Promise<void> {
    for (const p of this.state.listInstalled()) {
      if (p.enabled) {
        try {
          await this.load(p.ref);
        } catch (e) {
          this.logs.error("plugin.restore.error", { ref: p.ref, error: String(e) });
        }
      }
    }
  }

  async load(ref: string): Promise<void> {
    if (this.#byRef.has(ref)) return;
    const entry = ref.startsWith("file:") ? this.#fileRefToPath(ref) : this.store.resolveEntry(ref);
    if (!entry) throw new Error(`Cannot resolve plugin: ${ref}`);

    // Determine plugin directory and read package.json
    const pluginDir = entry.substring(0, entry.lastIndexOf("/")).replace(/\/src$/, "");
    const metadata = await this.#readPackageJson(pluginDir);
    const pluginId = metadata.name; // Use package name as plugin ID

    const proc = Bun.spawn({
      cmd: ["bun", entry],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
      env: { ...process.env, ELIA_PLUGIN_REF: ref, ELIA_PLUGIN_ID: pluginId },
    });
    const reader = new FrameReader(proc.stdout as ReadableStream<Uint8Array>);
    // biome-ignore lint/suspicious/noExplicitAny: Bun FileSink
    const writer = new FrameWriter(proc.stdin as any);

    const uid = generateUid();
    const plugin: RunningPlugin = {
      ref,
      dir: pluginDir,
      pid: proc.pid,
      proc,
      reader,
      writer,
      tools: new Set(),
      blocks: new Set(),
      subscriptions: new Set(),
      eventUnsubs: [],
      lastPong: now(),
      nextCallId: 1,
      pendingTools: new Map(),
      pendingBlocks: new Map(),
      id: pluginId,
      uid,
      version: metadata.version,
      metadata,
    };

    this.#byRef.set(ref, plugin);
    this.#idToRef.set(pluginId, ref);
    this.#uidToRef.set(uid, ref);
    this.#pipeStderr(plugin);
    this.#startPump(plugin);
    this.#startHeartbeat(plugin);
    this.#monitorProcessExit(plugin);
    this.#startStabilityCheck(plugin);
    this.#restartPolicy.onStart(ref);
    this.logs.info("plugin.loaded", { ref, id: pluginId, uid, version: metadata.version, pid: proc.pid });
  }

  /** Read and parse package.json from plugin directory */
  async #readPackageJson(pluginDir: string): Promise<PluginMetadata> {
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
      };
    } catch (e) {
      this.logs.warn("plugin.package.error", { dir: pluginDir, error: String(e) });
      const basename = pluginDir.substring(pluginDir.lastIndexOf("/") + 1);
      return {
        name: basename,
        version: "0.0.0",
      };
    }
  }

  async unload(ref: string, skipRestartReset = false): Promise<void> {
    const p = this.#byRef.get(ref);
    if (!p) return;
    if (p.heartbeat) clearInterval(p.heartbeat);
    for (const unsub of p.eventUnsubs) unsub();
    // Clean up stability timer
    const stabilityTimer = this.#stabilityTimers.get(ref);
    if (stabilityTimer) {
      clearInterval(stabilityTimer);
      this.#stabilityTimers.delete(ref);
    }
    try {
      await p.writer.send({ t: "stop" });
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
    try {
      p.proc.kill();
    } catch {}
    // Unregister tools and blocks using the package.json ID
    this.tools.unregisterByOwner(p.id);
    this.blocks.unregisterPlugin(p.id);
    // Clean up mappings
    this.#idToRef.delete(p.id);
    this.#uidToRef.delete(p.uid);
    this.#byRef.delete(ref);
    // Reset restart policy unless this is part of a crash-restart cycle
    if (!skipRestartReset) {
      this.#restartPolicy.reset(ref);
    }
    this.logs.info("plugin.unloaded", { ref, id: p.id });
  }

  async stopAll(): Promise<void> {
    for (const ref of this.#byRef.keys()) await this.unload(ref);
  }

  list(): PluginSummary[] {
    const out: PluginSummary[] = [];
    for (const p of this.#byRef.values()) {
      out.push({
        ref: p.ref,
        id: p.id,
        uid: p.uid,
        version: p.version,
        pid: p.pid,
        health: "running",
        tools: [...p.tools],
        blocks: [...p.blocks],
        lastError: null,
        metadata: p.metadata,
      });
    }
    // Add stopped/crashed plugins from state, filtering out stale entries
    const statePlugins = this.state.listInstalled();
    for (const s of statePlugins) {
      if (!this.#byRef.has(s.ref)) {
        // Check if a restart is pending
        const restartState = this.#restartPolicy.getState(s.ref);
        const health = restartState?.pendingTimer ? "restarting" : s.health;
        out.push({ ref: s.ref, health, tools: [], lastError: s.lastError ?? null });
      }
    }
    return out;
  }

  /**
   * Clean up stale state entries for file: refs that no longer exist
   */
  async cleanupStaleState(): Promise<void> {
    const statePlugins = this.state.listInstalled();
    for (const s of statePlugins) {
      if (s.ref.startsWith("file:")) {
        const filePath = s.ref.slice("file:".length);
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          this.logs.debug("plugin.state.cleanup", { ref: s.ref, reason: "file not found" });
          await this.state.remove(s.ref);
        }
      }
    }
  }

  /** Get a plugin by ID */
  getById(id: string): RunningPlugin | undefined {
    const ref = this.#idToRef.get(id);
    return ref ? this.#byRef.get(ref) : undefined;
  }

  /** Get plugin metadata and details */
  getDetails(id: string): PluginSummary | null {
    const p = this.getById(id);
    if (!p) return null;
    return {
      ref: p.ref,
      id: p.id,
      uid: p.uid,
      version: p.version,
      pid: p.pid,
      health: "running",
      tools: [...p.tools],
      blocks: [...p.blocks],
      lastError: null,
      metadata: p.metadata,
    };
  }

  /** Get a plugin by its short uid */
  getByUid(uid: string): RunningPlugin | undefined {
    const ref = this.#uidToRef.get(uid);
    return ref ? this.#byRef.get(ref) : undefined;
  }

  /** Get the plugin directory path for serving icons (accepts id or uid) */
  getPluginDir(idOrUid: string): string | null {
    const p = this.getById(idOrUid) ?? this.getByUid(idOrUid);
    return p?.dir ?? null;
  }

  /** Get plugin details by uid */
  getDetailsByUid(uid: string): PluginSummary | null {
    const p = this.getByUid(uid);
    if (!p) return null;
    return {
      ref: p.ref,
      id: p.id,
      uid: p.uid,
      version: p.version,
      pid: p.pid,
      health: "running",
      tools: [...p.tools],
      blocks: [...p.blocks],
      lastError: null,
      metadata: p.metadata,
    };
  }

  async enable(ref: string): Promise<void> {
    await this.state.setEnabled(ref, true);
    await this.load(ref);
  }
  async disable(ref: string): Promise<void> {
    await this.state.setEnabled(ref, false);
    await this.unload(ref);
  }
  async reload(ref: string): Promise<void> {
    await this.unload(ref);
    await this.load(ref);
  }
  async kill(ref: string): Promise<void> {
    const p = this.#byRef.get(ref);
    if (!p) return;
    try {
      p.proc.kill(9);
    } catch {}
    await this.state.setHealth(ref, "crashed", "killed");
    await this.unload(ref);
  }

  async callTool(
    ref: string,
    toolName: string,
    args: Record<string, Json>,
    ctx: ToolCallContext,
  ): Promise<ToolResult> {
    const p = this.#byRef.get(ref);
    if (!p) return { ok: false, content: `Plugin not loaded: ${ref}` };
    const id = p.nextCallId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        p.pendingTools.delete(id);
        reject(new Error("Timeout"));
      }, this.opts.callTimeoutMs);
      p.pendingTools.set(id, { resolve, reject, timer });
      p.writer.send({ t: "callTool", id, tool: toolName, args, ctx }).catch(reject);
    });
  }

  /**
   * Execute a block in a plugin
   */
  async executeBlock(
    blockType: string,
    config: Record<string, Json>,
    context: BlockContext,
  ): Promise<BlockResult> {
    // Get the plugin ID that provides this block
    const pluginId = this.blocks.getProvider(blockType);
    if (!pluginId) return { error: `Unknown block type: ${blockType}`, stop: true };

    // Resolve plugin ID to installation ref
    const pluginRef = this.#idToRef.get(pluginId);
    if (!pluginRef) return { error: `Plugin ID not found: ${pluginId}`, stop: true };

    const p = this.#byRef.get(pluginRef);
    if (!p) return { error: `Plugin not loaded: ${pluginRef}`, stop: true };

    // Extract local block ID (after the :)
    const localBlockId = blockType.includes(":") ? blockType.split(":")[1] : blockType;

    const id = p.nextCallId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        p.pendingBlocks.delete(id);
        reject(new Error("Block execution timeout"));
      }, this.opts.callTimeoutMs);
      p.pendingBlocks.set(id, { resolve, reject, timer });
      // Send local block ID to the plugin (it doesn't know about the prefix)
      p.writer.send({ t: "executeBlock", id, blockType: localBlockId, config, context }).catch(reject);
    });
  }

  #fileRefToPath(ref: string): string {
    const p = ref.slice("file:".length);
    return p.startsWith("/") ? p : `${process.cwd()}/${p}`;
  }

  #startPump(p: RunningPlugin): void {
    (async () => {
      let exitReason = "unknown";
      try {
        for (;;) {
          const msg = await p.reader.next();
          if (!msg) {
            exitReason = "stdout closed (plugin process ended)";
            break;
          }
          await this.#handle(p, msg);
        }
      } catch (e) {
        exitReason = `pump error: ${String(e)}`;
        this.logs.error("plugin.pump.error", { ref: p.ref, id: p.id, error: String(e) });
      } finally {
        if (this.#byRef.get(p.ref) === p) {
          this.logs.error("plugin.crashed", {
            ref: p.ref,
            id: p.id,
            pid: p.pid,
            reason: exitReason,
          });
          await this.state.setHealth(p.ref, "crashed", exitReason);
          // Unload but preserve restart state
          await this.unload(p.ref, true);
          // Attempt auto-restart if enabled
          this.#attemptAutoRestart(p.ref, exitReason);
        }
      }
    })();
  }

  async #handle(p: RunningPlugin, msg: Wire): Promise<void> {
    if (msg.t === "hello") {
      // Plugin ID comes from package.json, not from the plugin itself
      // Log the hello for debugging but don't override our ID
      this.logs.debug("plugin.hello", {
        declaredId: msg.plugin.id,
        actualId: p.id,
        version: msg.plugin.version,
      });
      return;
    }
    if (msg.t === "ready") return;
    if (msg.t === "pong") {
      p.lastPong = now();
      return;
    }
    if (msg.t === "log") {
      this.logs.emit({
        ts: now(),
        level: msg.level,
        source: "plugin",
        pluginRef: p.ref,
        message: msg.message,
        meta: msg.meta,
      });
      return;
    }
    if (msg.t === "registerTool") {
      // Use plugin ID from package.json (e.g., "@elia/plugin-timer:set")
      const fullName = `${p.id}:${msg.tool.id}`;
      p.tools.add(fullName);
      this.tools.register(msg.tool.id, p.id, {
        description: msg.tool.description,
        inputSchema: msg.tool.inputSchema,
        call: (args, ctx) => this.callTool(p.ref, msg.tool.id, args, ctx),
      });
      this.logs.debug("plugin.tool.registered", { tool: fullName, plugin: p.id });
      return;
    }
    if (msg.t === "registerBlock") {
      // Use plugin ID from package.json (e.g., "@elia/blocks-builtin:condition")
      const fullName = `${p.id}:${msg.block.id}`;
      p.blocks.add(fullName);
      this.blocks.register(msg.block, p.id);
      this.logs.debug("plugin.block.registered", { block: fullName, plugin: p.id });
      return;
    }
    if (msg.t === "toolResult") {
      const pending = p.pendingTools.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        p.pendingTools.delete(msg.id);
        pending.resolve(msg.result);
      }
      return;
    }
    if (msg.t === "blockResult") {
      const pending = p.pendingBlocks.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        p.pendingBlocks.delete(msg.id);
        pending.resolve(msg.result);
      }
      return;
    }
    if (msg.t === "emit") {
      this.events.emit(msg.eventType, p.ref, msg.payload);
      return;
    }
    if (msg.t === "subscribe") {
      for (const pattern of msg.patterns) {
        if (!p.subscriptions.has(pattern)) {
          p.subscriptions.add(pattern);
          p.eventUnsubs.push(
            this.events.subscribe(pattern, (e) => p.writer.send({ t: "event", event: e }).catch(() => {})),
          );
        }
      }
      return;
    }
  }

  #pipeStderr(p: RunningPlugin): void {
    (async () => {
      const decoder = new TextDecoder();
      const reader = (p.proc.stderr as ReadableStream<Uint8Array>).getReader();
      let buffer = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Process complete lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.logs.error("plugin.stderr", {
                id: p.id,
                pid: p.pid,
                message: trimmed,
              });
            }
          }
        }
        // Flush remaining buffer
        if (buffer.trim()) {
          this.logs.error("plugin.stderr", {
            id: p.id,
            pid: p.pid,
            message: buffer.trim(),
          });
        }
      } catch (e) {
        this.logs.warn("plugin.stderr.error", { id: p.id, error: String(e) });
      }
    })();
  }

  #startHeartbeat(p: RunningPlugin): void {
    this.logs.info("plugin.heartbeat.started", { id: p.id, intervalMs: this.opts.heartbeatEveryMs });
    p.heartbeat = setInterval(() => {
      p.writer.send({ t: "ping", ts: now() }).catch((err) => {
        this.logs.warn("plugin.heartbeat.send.failed", { id: p.id, error: String(err) });
      });
      const silentMs = now() - p.lastPong;
      if (silentMs > this.opts.heartbeatTimeoutMs) {
        this.logs.error("plugin.heartbeat.missed", {
          ref: p.ref,
          id: p.id,
          pid: p.pid,
          silentMs,
          timeoutMs: this.opts.heartbeatTimeoutMs,
        });
        this.kill(p.ref).catch(() => {});
      }
    }, this.opts.heartbeatEveryMs);
  }

  /** Monitor process exit and log exit code/signal */
  #monitorProcessExit(p: RunningPlugin): void {
    p.proc.exited
      .then((code) => {
        // Only log if plugin is still registered (not already unloaded)
        if (this.#byRef.has(p.ref)) {
          this.logs.warn("plugin.process.exited", {
            ref: p.ref,
            id: p.id,
            pid: p.pid,
            exitCode: code,
            signal: p.proc.signalCode,
          });
        }
      })
      .catch(() => {});
  }

  /** Start a timer that checks if the plugin has been stable long enough to reset backoff */
  #startStabilityCheck(p: RunningPlugin): void {
    // Check periodically until stable
    const timer = setInterval(() => {
      if (this.#restartPolicy.checkStability(p.ref)) {
        this.logs.debug("plugin.stable", {
          ref: p.ref,
          id: p.id,
          thresholdMs: this.opts.restartStabilityMs,
        });
        clearInterval(timer);
        this.#stabilityTimers.delete(p.ref);
      }
    }, 5000); // Check every 5 seconds
    this.#stabilityTimers.set(p.ref, timer);
  }

  /** Attempt to auto-restart a crashed plugin using the restart policy */
  #attemptAutoRestart(ref: string, reason: string): void {
    if (!this.opts.autoRestartEnabled) return;

    // Check if the plugin is still enabled
    const pluginState = this.state.get(ref);
    if (!pluginState?.enabled) {
      this.logs.debug("plugin.restart.skip", { ref, reason: "plugin disabled" });
      return;
    }

    const decision = this.#restartPolicy.onCrash(ref);

    if (decision.action === "crash-loop") {
      this.logs.error("plugin.crash-loop", {
        ref,
        reason: decision.reason,
      });
      this.state.setHealth(ref, "crash-loop", `Crash loop detected: ${decision.reason}`);
      return;
    }

    // Schedule restart with exponential backoff
    this.logs.info("plugin.restart.scheduled", {
      ref,
      delayMs: decision.delayMs,
      crashReason: reason,
    });
    this.state.setHealth(ref, "restarting", `Restarting in ${Math.round(decision.delayMs / 1000)}s`);

    this.#restartPolicy.scheduleRestart(ref, decision.delayMs, async () => {
      try {
        this.logs.info("plugin.restart.attempting", { ref });
        await this.load(ref);
        this.logs.info("plugin.restart.success", { ref });
      } catch (e) {
        this.logs.error("plugin.restart.failed", { ref, error: String(e) });
        // The load failure will trigger another crash cycle
      }
    });
  }
}
