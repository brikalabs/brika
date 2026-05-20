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
import { installVector } from '@brika/sdk/ctx';

type StopHandler = () => void | Promise<void>;

import {
  getCapabilityVector,
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

const channel = new Channel({
  send: (msg) => {
    process.send?.(msg);
  },
});

// ---- Message routing ----
// Two paths:
//
//   - Inbound RPC RESPONSES (`<type>Result` with `_id`) dispatch synchronously
//     via channel.handle. They land in a pending-promise map and resolve any
//     outbound channel.call that's currently awaiting — they MUST NOT queue,
//     otherwise an RPC handler that awaits a nested call deadlocks (the
//     handler holds the drain; its response is queued; drain can't progress).
//
//   - Everything else (requests + fire-and-forget messages) goes through a
//     sequential drain to preserve FIFO ordering. `setTimezone` must take
//     effect before the next RPC reads `process.env.TZ`, etc.

const messageQueue: WireMessage[] = [];
let draining = false;

function isRpcResponse(msg: WireMessage): boolean {
  return typeof msg.t === 'string' && msg.t.endsWith('Result') && msg._id !== undefined;
}

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

process.on('message', (msg: WireMessage) => {
  if (isRpcResponse(msg)) {
    // Synchronous fast-path: resolves any pending channel.call without
    // touching the drain queue. handleRpcResponse is itself sync.
    channel.handle(msg).catch((e) => console.error('[prelude] response dispatch error:', e));
    return;
  }
  messageQueue.push(msg);
  drain().catch((e) => console.error('[prelude] drain error:', e));
});

process.on('disconnect', () => {
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
    // Fetch and install the capability vector before reporting ready so any
    // `ctx.foo.bar()` call after this point sees the granted set. The hub
    // computes this from the current manifest+grants — see
    // `apps/hub/src/runtime/plugins/capabilities/vector.ts`.
    try {
      const vector = await channel.call(getCapabilityVector, {});
      installVector(vector);
    } catch (e) {
      log('warn', 'Failed to install capability vector; ctx.* calls will fail until retried', {
        error: e instanceof Error ? e.message : String(e),
      });
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
