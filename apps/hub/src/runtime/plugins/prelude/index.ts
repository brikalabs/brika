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
import { setupRoutes } from './routes';
import { setupSecrets } from './secrets';
import { setupSparks } from './sparks';

// ---- Manifest ----

const { manifest, rootDir } = loadManifest();
const declaredSparks = new Set(manifest.sparks?.map((s) => s.id) ?? []);
const declaredBricks = new Set(manifest.bricks?.map((b) => b.id) ?? []);
const declaredBlocks = new Map(manifest.blocks?.map((b) => [b.id, b]) ?? []);

// ---- State ----

const stopHandlers: StopHandler[] = [];

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

// ---- Sequential message queue ----
// Channel.handle() is async, so dispatching multiple buffered messages in
// the same tick can interleave their execution. The drain queue ensures
// strict FIFO ordering: each message fully completes before the next starts.

const messageQueue: WireMessage[] = [];
let draining = false;

async function drain(): Promise<void> {
  if (draining) {
    return;
  }
  draining = true;
  try {
    let msg = messageQueue.shift();
    while (msg) {
      await channel.handle(msg);
      msg = messageQueue.shift();
    }
  } finally {
    draining = false;
  }
}

safeOn('message', (msg: WireMessage) => {
  messageQueue.push(msg);
  drain().catch((e) => console.error('[prelude] drain error:', e));
});

safeOn('disconnect', () => {
  channel.close(new Error('IPC disconnected'));
});

// ---- Log helper ----

function log(level: LogLevelType, message: string, meta?: Record<string, Json>): void {
  channel.send(logMsg, { level, message, meta });
}

// ---- Domain modules ----

const lifecycle = setupLifecycle(channel, log);
const actions = setupActions(channel);
const routes = setupRoutes(channel);
const sparks = setupSparks(channel, log, declaredSparks);
const blocks = setupBlocks(channel, log, declaredBlocks);
const bricks = setupBricks(channel, log, declaredBricks);
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
    channel.send(ready, {});
  },
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
