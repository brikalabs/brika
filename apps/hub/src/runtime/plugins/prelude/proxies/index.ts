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

export interface InstallProxiesDeps {
  readonly channel: Channel;
  /**
   * Plugin-scoped logger. Wired to `channel.send(logMsg, ...)` so the
   * notices flow through the hub's structured log pipeline.
   */
  readonly log: (level: LogLevelType, message: string) => void;
}

/**
 * Install every network-side proxy. Each step is independent; we don't
 * stop on partial failure because a missing slot just means the lockdown
 * never scrubbed it (e.g. running on an older Bun version with no `fetch`
 * global) — which is fine and reported via the log for visibility.
 */
export function installNetProxies(deps: InstallProxiesDeps): void {
  installFetch(deps);
  installDns(deps);
  installBunFile(deps);
}

function installBunFile(deps: InstallProxiesDeps): void {
  // `Bun.file` was scrubbed in lockdown.ts; swap in a real proxy that
  // routes reads through `ctx.fs` (via `globalThis.__brika_fs`).
  const factory = buildBunFileProxy();
  if (!swapInProxy('Bun', 'file', factory)) {
    deps.log(
      'warn',
      'installBunFile: scrub slot Bun.file was not found — Bun.file() is still a deny stub.'
    );
  }
}

function installFetch(deps: InstallProxiesDeps): void {
  const proxy = buildFetchProxy({
    channel: deps.channel,
    onUnmodeled: (key) => {
      deps.log(
        'debug',
        `fetch(): the "${key}" init option is not modelled by net.fetch and was ignored. Use ctx.net.fetch directly if you need finer control.`
      );
    },
  });
  if (!swapInProxy('globalThis', 'fetch', proxy)) {
    deps.log(
      'warn',
      'installFetch: scrub slot was not found — global fetch is still a deny stub. This usually means the runtime had no fetch global to begin with.'
    );
  }
}

function installDns(deps: InstallProxiesDeps): void {
  const proxies = buildDnsProxies({ channel: deps.channel });
  const entries: ReadonlyArray<[string, unknown]> = [
    ['lookup', proxies.lookup],
    ['resolveTxt', proxies.resolveTxt],
    ['resolveMx', proxies.resolveMx],
  ];
  for (const [key, proxy] of entries) {
    if (!swapInProxy('Bun.dns', key, proxy)) {
      deps.log(
        'warn',
        `installDns: scrub slot Bun.dns.${key} was not found — the method is still a deny stub. Plugins calling it will see PERMISSION_DENIED.`
      );
    }
  }
}
