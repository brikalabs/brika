/**
 * Hub grant registry factory.
 *
 * Builds a `GrantRegistry` per `PluginProcess` so each handler closes over
 * the plugin-scoped callbacks (logging, secret namespace, etc.). A shared
 * registry would force every handler to look up the calling plugin from a
 * session map; the per-process registry keeps that lookup at zero cost.
 *
 * The registry also computes the per-plugin vector via `buildVector` — see
 * vector.ts.
 */

import { type AuditLogger, GrantRegistry } from '@brika/grants';
import {
  fsExists,
  fsMkdir,
  fsReaddir,
  fsReadFile,
  fsRm,
  fsStat,
  fsWriteFile,
  locationGet,
  netSocket,
  secretsDelete,
  secretsGet,
  secretsSet,
  uiPickFile,
  wsClose,
  wsConnect,
  wsSend,
} from '@brika/sdk/grants';
import { buildDnsGrants, type DnsGrantOptions } from './dns';
import { buildFsGrants, type FsGrantOptions } from './fs';
import { buildNetGrants, type NetCallbacks, type NetGrantOptions } from './net';
import { buildUiGrants, type UiGrantOptions } from './ui';
import { buildWsGrants, type WsGrantOptions } from './ws';

// Type alias instead of empty `interface extends` so biome's no-empty-
// interface lint doesn't flag it. Extend with `& XyzCallbacks` as more
// grant families land.
export type HubGrantCallbacks = NetCallbacks;

/**
 * Per-family overrides callers may inject. Production wiring leaves
 * everything undefined and accepts the defaults; tests pass stub
 * resolvers / smaller caps / a collecting audit logger to drive
 * deterministic behaviour without touching real DNS, fd budgets, or
 * the hub's log pipeline.
 */
export interface HubGrantOptions {
  readonly net?: NetGrantOptions;
  readonly dns?: DnsGrantOptions;
  /**
   * Filesystem grant configuration. Required to register the
   * `dev.brika.fs.*` family: the hub must know which backing host
   * directories the plugin's virtual roots map to. Omit to leave the
   * fs grants unregistered (a plugin that calls `ctx.fs.*` then sees
   * `PERMISSION_DENIED`).
   */
  readonly fs?: FsGrantOptions;
  /**
   * WebSocket grant configuration. Required to register the
   * `dev.brika.ws.*` family — the hub needs the stream sink (the
   * plugin's IPC channel) to push inbound frames at the plugin.
   */
  readonly ws?: WsGrantOptions;
  /**
   * UI grant configuration. Required to register `ctx.ui.pickFile`.
   * Needs the same `EphemeralRoots` instance the `fs` family was
   * built with so a token minted by the picker resolves on the
   * plugin's next `ctx.fs.readFile`.
   */
  readonly ui?: UiGrantOptions;
  /**
   * Sink for per-dispatch audit entries. Production wires this to the
   * hub's structured log; tests pass a collecting array. Omit to skip
   * audit emission entirely.
   */
  readonly auditLogger?: AuditLogger;
}

/**
 * Create a fresh registry pre-populated with every hub-owned grant.
 *
 * Adding a new grant family is: write the spec in `@brika/sdk/grants/<name>`,
 * add a `XyzCallbacks` interface and a `buildXyzGrants(cb)` factory in
 * `apps/hub/src/runtime/plugins/grants/<name>/`, extend `HubGrantCallbacks`
 * above, and register here. No PreludeBridge interface to update, no domain
 * setup module, no SDK API to add.
 */
export function buildHubGrants(cb: HubGrantCallbacks, opts?: HubGrantOptions): GrantRegistry {
  const reg = new GrantRegistry({ auditLogger: opts?.auditLogger });
  for (const grant of buildNetGrants(cb, opts?.net)) {
    reg.register(grant);
  }
  for (const grant of buildDnsGrants(opts?.dns)) {
    reg.register(grant);
  }
  // location + secrets are gated by the grant vector but dispatched via
  // dedicated RPCs in plugin-process.ts; the spec handlers are never
  // invoked. They live in the registry so manifest consent + vector
  // construction see them like any other grant family.
  reg.register(locationGet);
  // net.socket is the raw-socket capability — realised at the L1 lockdown
  // (the hub forwards BRIKA_PLUGIN_RAW_SOCKETS=1 when it's consented), never
  // dispatched. Registered so the manifest request + consent toggle resolve.
  reg.register(netSocket);
  reg.register(secretsGet);
  reg.register(secretsSet);
  reg.register(secretsDelete);

  // fs / ws / ui: register the SDK specs as fallback when the hub hasn't
  // wired real handlers via opts. Without this, a plugin that declares
  // `dev.brika.fs.*` in its manifest has those ids dropped during vector
  // construction (as "unknown grant — not registered with the hub"), and
  // the consent UI never sees the family. With opts, real handlers
  // override the placeholders.
  if (opts?.fs === undefined) {
    reg.register(fsReadFile);
    reg.register(fsWriteFile);
    reg.register(fsReaddir);
    reg.register(fsStat);
    reg.register(fsExists);
    reg.register(fsMkdir);
    reg.register(fsRm);
  } else {
    for (const grant of buildFsGrants(opts.fs)) {
      reg.register(grant);
    }
  }
  if (opts?.ws === undefined) {
    reg.register(wsConnect);
    reg.register(wsSend);
    reg.register(wsClose);
  } else {
    for (const grant of buildWsGrants(opts.ws)) {
      reg.register(grant);
    }
  }
  if (opts?.ui === undefined) {
    reg.register(uiPickFile);
  } else {
    for (const grant of buildUiGrants(opts.ui)) {
      reg.register(grant);
    }
  }
  return reg;
}
