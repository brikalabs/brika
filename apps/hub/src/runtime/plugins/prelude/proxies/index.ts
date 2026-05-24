/**
 * Network-API proxies installed by the prelude AFTER the grant vector
 * lands. Each proxy replaces a slot previously scrubbed by `lockdown.ts`
 * with a real grant-mediated implementation, and re-snapshots the slot
 * so `assertSealed()` sees the proxy as the sealed value rather than
 * reporting drift.
 *
 * Why this is a separate file: the lockdown runs at `--preload` time,
 * before any IPC channel exists; it can only install deny-stubs. The
 * proxies need the channel (which is created in `prelude/index.ts`) and
 * the granted scope (fetched from the hub), so they install later. The
 * `swapInProxy` helper from `lockdown.ts` keeps the integrity gate
 * consistent across both halves.
 */

import type { Channel } from '@brika/ipc';
import type { LogLevelType } from '@brika/ipc/contract';
import { swapInProxy } from '../lockdown';
import { buildBunFileProxy } from './bun-file-proxy';
import { buildDnsProxies } from './dns-proxy';
import { buildFetchProxy } from './fetch-proxy';
import { buildWebSocketProxy } from './websocket-proxy';

export interface InstallProxiesDeps {
  readonly channel: Channel;
  /**
   * Plugin-scoped logger. Wired to `channel.send(logMsg, ...)` so the
   * notices flow through the hub's structured log pipeline.
   */
  readonly log: (level: LogLevelType, message: string) => void;
}

/** Owner namespaces accepted by `swapInProxy`. Mirrors `ProxyOwner` in lockdown.ts. */
type ProxyOwner = 'globalThis' | 'Bun' | 'Bun.dns' | 'process';

interface ProxyEntry {
  readonly owner: ProxyOwner;
  readonly key: string;
  readonly replacement: unknown;
}

/**
 * Install every network-side proxy. Each step is independent; we don't
 * stop on partial failure because a missing slot just means the lockdown
 * never scrubbed it (e.g. running on an older Bun version with no `fetch`
 * global) — which is fine and reported via the log for visibility.
 */
export function installNetProxies(deps: InstallProxiesDeps): void {
  const dnsProxies = buildDnsProxies({ channel: deps.channel });
  const fetchProxy = buildFetchProxy({
    channel: deps.channel,
    onUnmodeled: (key) => {
      deps.log(
        'debug',
        `fetch(): the "${key}" init option is not modelled by net.fetch and was ignored. Use ctx.net.fetch directly if you need finer control.`
      );
    },
  });
  const { Constructor: WebSocketCtor } = buildWebSocketProxy({ channel: deps.channel });

  const entries: ReadonlyArray<ProxyEntry> = [
    { owner: 'globalThis', key: 'fetch', replacement: fetchProxy },
    { owner: 'globalThis', key: 'WebSocket', replacement: WebSocketCtor },
    { owner: 'Bun', key: 'file', replacement: buildBunFileProxy() },
    { owner: 'Bun.dns', key: 'lookup', replacement: dnsProxies.lookup },
    { owner: 'Bun.dns', key: 'resolveTxt', replacement: dnsProxies.resolveTxt },
    { owner: 'Bun.dns', key: 'resolveMx', replacement: dnsProxies.resolveMx },
  ];

  for (const { owner, key, replacement } of entries) {
    if (!swapInProxy(owner, key, replacement)) {
      deps.log(
        'warn',
        `installNetProxies: scrub slot ${owner}.${key} was not found — the proxy was not installed and the slot remains a deny stub.`
      );
    }
  }
}
