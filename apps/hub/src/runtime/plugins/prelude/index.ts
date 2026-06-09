/**
 * Plugin Runtime Prelude
 *
 * Hub-controlled code injected into every plugin process via Bun's --preload
 * flag. Runs BEFORE the plugin's own code and owns the IPC backbone:
 * message routing, RPC request/response, system-level handlers, manifest
 * validation, and all domain module logic.
 *
 * The SDK detects this prelude via globalThis.__brika_ipc and uses the
 * pre-built bridge instead of managing its own IPC, keeping the SDK as a
 * thin typed wrapper.
 *
 * Messages are processed sequentially via a drain queue to prevent ordering
 * races from Channel's async dispatch (e.g. a setTimezone fire-and-forget
 * must take effect before a subsequent RPC reads process.env.TZ).
 *
 * Since Bun supports TypeScript natively in --preload, this file is used
 * directly as a .ts source -- no build step needed.
 */

import { Channel, type Json, type WireMessage } from '@brika/ipc';
import { PRELUDE_BRAND, type PreludeBridge } from '@brika/sdk/bridge';
// IMPORTANT: lockdown MUST be the first import. It scrubs ambient I/O
// (globalThis.fetch, Bun.spawn, …) and installs the module deny-list
// before any other module body runs. See lockdown.ts for details.
import {
  assertSealed,
  getSafeProcessOn,
  getSafeProcessSend,
  getVectorWriteKey,
  installVectorV2,
} from './lockdown';

type StopHandler = () => void | Promise<void>;

import {
  capture as captureMsg,
  getGrantVector,
  hello,
  type LogLevelType,
  log as logMsg,
  ping,
  ready,
  setTimezone,
  stop,
} from '@brika/ipc/contract';
import { setupActions } from './actions';
import { setupBlocks } from './blocks';
import { setupBricks } from './bricks';
import { setupLifecycle } from './lifecycle';
import { setupLocation } from './location';
import { loadManifest } from './manifest';
import { installNetProxies } from './proxies';
import { installFsRuntime } from './proxies/fs-runtime';
import { setupRoutes } from './routes';
import { setupSecrets } from './secrets';
import { setupSparks } from './sparks';
import { setupTools } from './tools';

// ---- Manifest ----

const { manifest, rootDir } = loadManifest();
const declaredSparks = new Set(manifest.sparks?.map((s) => s.id) ?? []);
const declaredBricks = new Set(manifest.bricks?.map((b) => b.id) ?? []);
const declaredBlocks = new Map(manifest.blocks?.map((b) => [b.id, b]) ?? []);

// ---- State ----

const stopHandlers: StopHandler[] = [];

// ---- Grant-vector gate ----
// The grant vector (and the real net fetch/WebSocket proxies it unlocks) is
// only installed inside `start()`, after a `getGrantVector` round-trip. The
// hub, however, sends `preferences` (which fires onInit) and `updateBrickConfig`
// (which fires onBrickConfigChange) as soon as it sees our `hello`, and those
// can land BEFORE the vector is applied. A plugin that calls `ctx.net.fetch` or
// `globalThis.fetch` from one of those early handlers would hit the scrubbed
// deny-stub ("globalThis.fetch is not available to plugin").
//
// `vectorReady` gates those handlers: they await it before invoking any
// plugin-facing callback, so config/init work never runs until the proxies
// are live. Awaiting inside each handler preserves arrival order (handlers
// resume in the order they suspended). This does NOT weaken the security
// boundary: the vector is installed exactly as before, only the plugin's
// observation of config/init is deferred to after it lands.
const vectorGate = Promise.withResolvers<void>();
const vectorReady = vectorGate.promise;

// ---- Channel setup ----
// `process.send` and `process.on` are scrubbed by lockdown.ts on enforce
// mode, so reach them through the captured-reference accessors. Plugin
// code that calls process.send directly hits the scrub stub.

const safeSend = getSafeProcessSend();
const safeOn = getSafeProcessOn();

const channel = new Channel({
  send: (msg) => {
    safeSend(msg);
  },
});

// Install `globalThis.__brika_fs` immediately. The compile-time
// `node:fs/promises` shim references this global at call time; if a
// plugin's bundled top-level body imports the shim and calls fs
// methods before `start()`, the runtime needs to already be there.
// The hub-side scope check is what enforces permissions — the
// runtime just dispatches.
installFsRuntime({ channel });

// ---- Message dispatch ----
// `channel.handle()` is async because RPC request handlers can await — but
// awaiting each `handle()` before the next deadlocks any handler that
// itself awaits another IPC round-trip (e.g. a route handler that calls
// `ctx.fs.*` — the response message would queue behind the still-running
// route handler). Fire-and-forget keeps the JS microtask queue ordering
// (each `channel.handle` is started in receive order) without blocking
// the next message on the previous handler's completion. RPC RESPONSE
// dispatch inside `handle()` is synchronous, so the pending-RPC `resolve`
// runs immediately when the response arrives, even if a route handler is
// concurrently `await`-ing it.

safeOn('message', (msg: WireMessage) => {
  channel.handle(msg).catch((e) => console.error('[prelude] handle error:', e));
});

safeOn('disconnect', () => {
  channel.close(new Error('IPC disconnected'));
  // The hub closed the IPC channel (graceful unload, or the hub itself went
  // away). Nothing can reach this process anymore, so exit instead of lingering
  // as an orphan.
  process.exit(0);
});

// Parent-death watchdog. Bun does not deliver a reliable 'disconnect' when the
// hub dies abruptly (the dev supervisor SIGKILLs it on restart, or it crashes),
// and macOS has no PR_SET_PDEATHSIG. Bun's `process.ppid` is live, so once we
// are reparented to init (ppid 1) the hub is gone and we must exit, otherwise
// the host leaks as an orphan forever. `.unref()` keeps this timer from holding
// the process open on its own.
const PARENT_DEATH_POLL_MS = 2000;
setInterval(() => {
  if (process.ppid === 1) {
    process.exit(0);
  }
}, PARENT_DEATH_POLL_MS).unref();

// ---- Log helper ----

function log(level: LogLevelType, message: string, meta?: Record<string, Json>): void {
  channel.send(logMsg, { level, message, meta });
}

function capture(name: string, props?: Record<string, Json>, distinctId?: string): void {
  channel.send(captureMsg, { name, props, distinctId });
}

// ---- Domain modules ----

const lifecycle = setupLifecycle(channel, log, vectorReady);
const actions = setupActions(channel);
const tools = setupTools(channel);
const routes = setupRoutes(channel);
const sparks = setupSparks(channel, log, declaredSparks);
const blocks = setupBlocks(channel, log, declaredBlocks);
const bricks = setupBricks(channel, log, declaredBricks, vectorReady);
const location = setupLocation(channel);
const secrets = setupSecrets(channel);

// ---- System handlers ----

channel.implement(ping, ({ ts }) => ({ ts }));

channel.on(stop, async () => {
  blocks.stopAllInstances();
  for (let i = stopHandlers.length; i-- > 0; ) {
    try {
      await stopHandlers[i]();
    } catch {
      // Ignore cleanup errors during shutdown
    }
  }
  process.exit(0);
});

channel.on(setTimezone, ({ timezone }) => {
  if (timezone) {
    process.env.TZ = timezone;
  } else {
    delete process.env.TZ;
  }
  location.invalidateTimezone();
});

// ---- Expose bridge for SDK ----

const bridge = {
  [PRELUDE_BRAND]: true as const,
  channel,

  // System
  async start() {
    channel.send(hello, { plugin: { id: manifest.name, version: manifest.version } });
    // Fetch and install the grant vector before reporting ready, so any
    // ctx.foo.bar() call after this point sees the permitted set. The hub
    // computes the vector from manifest + permits — see
    // apps/hub/src/runtime/plugins/grants/vector.ts.
    try {
      const vector = await channel.call(getGrantVector, {});
      installVectorV2(vector, getVectorWriteKey());
    } catch (e) {
      // Vector install failure is fatal: if we send `ready` anyway, the
      // plugin looks healthy but every `ctx.*` call throws the unrelated
      // "not installed yet" diagnostic, which misleads debugging. Refuse
      // to come up — the hub's restart-policy decides what happens next.
      log(
        'error',
        'Failed to install grant vector — plugin cannot start. Restart the plugin to retry.',
        {
          error: e instanceof Error ? e.message : String(e),
        }
      );
      process.exit(78); // EX_CONFIG (sysexits.h) — config/setup failure
    }
    // Swap the scrubbed deny-stubs (globalThis.fetch, etc.) for real
    // grant-mediated proxies now that the vector is installed and the
    // channel is live. swapInProxy keeps the snapshot in sync so
    // assertSealed() below still passes.
    installNetProxies({ channel, log: (level, message) => log(level, message) });
    // Final integrity gate: refuse to come up if anything mutated a
    // scrubbed global between lockdown and now (a transitively-imported
    // module patched fetch, etc.). Better to crash than to silently
    // allow a hole.
    const drift = assertSealed();
    if (drift !== null && drift.length > 0) {
      log('error', 'Lockdown integrity check failed — refusing to start', {
        drift: [...drift],
      });
      process.exit(78);
    }
    // The grant vector and net proxies are now live. Release any
    // preferences/brick-config handlers that arrived early and parked on
    // `vectorReady`, so onInit / onBrickConfigChange can safely call fetch.
    vectorGate.resolve();
    channel.send(ready, {});
  },
  capture,
  onStop(handler: StopHandler) {
    stopHandlers.push(handler);
    return () => {
      const idx = stopHandlers.indexOf(handler);
      if (idx >= 0) {
        stopHandlers.splice(idx, 1);
      }
    };
  },
  log,

  // Manifest
  getManifest() {
    return manifest;
  },
  getPluginRootDirectory() {
    return rootDir;
  },
  getPluginUid() {
    const uid = lifecycle.getPreferences().__plugin_uid;
    return typeof uid === 'string' ? uid : undefined;
  },

  // Lifecycle
  ...lifecycle,

  // Actions
  ...actions,

  // Tools
  ...tools,

  // Routes
  ...routes,

  // Blocks
  ...blocks,

  // Sparks
  ...sparks,

  // Bricks
  ...bricks,

  // Location
  ...location,

  // Secrets
  ...secrets,
};

globalThis.__brika_ipc = bridge satisfies PreludeBridge;
