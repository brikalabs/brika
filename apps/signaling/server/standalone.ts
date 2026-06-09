#!/usr/bin/env bun
/**
 * Brika signaling — standalone entry.
 *
 * Same `buildApp(deps)` the Cloudflare Worker uses, wired against runtime-
 * neutral building blocks (SQLite `ClaimStore`, an in-process
 * `Map<hubName, HubSessionState>`, a filesystem asset Fetcher). This file is
 * the one place that needs runtime detection: how to start an HTTP server and
 * how to handle WebSocket upgrades.
 *
 * Bun is the supported runtime. The {@link startStandalone} factory is
 * exported so tests can spin up a full server (real Bun.serve, real WebSocket
 * upgrades) with synthetic env + an in-memory ClaimStore. See
 * `__tests__/standalone-e2e.test.ts`.
 */

import {
  type ClaimStore,
  CloudflareIceServerProvider,
  HubSessionState,
  type IceServerProvider,
  NoneIceServerProvider,
  StaticIceServerProvider,
} from '@brika/remote-access-protocol';
import { type AppDeps, buildApp } from './app';
import { openSqliteClaimStore } from './claims-sqlite';
import { parseStandaloneEnv, type StandaloneEnv } from './env';
import { applyPendingMigrations } from './migrations';
import { clientIpFromRequest, InMemoryRateLimiter } from './rate-limit';
import { createFilesystemAssets } from './standalone-assets';

interface SocketData {
  kind: 'hub' | 'client';
  name: string;
  clientIp?: string;
  clientUserAgent?: string;
}

/** Test/integration injection points — bypass the env-driven defaults. */
export interface StartStandaloneOverride {
  /** Skip `openSqliteClaimStore` and use this store instead. */
  claims?: ClaimStore;
  /** Skip `createFilesystemAssets` and use this Fetcher. */
  assets?: AppDeps['assets'];
}

/** Result of `startStandalone` — the running server plus context for the banner. */
export interface StartStandaloneResult {
  readonly server: import('bun').Server<SocketData>;
  /** Names of migrations applied this boot (empty → schema was already up to date). */
  readonly migrationsApplied: ReadonlyArray<string>;
}

function buildIce(env: StandaloneEnv): IceServerProvider {
  if (env.turn.kind === 'none') {
    return new NoneIceServerProvider();
  }
  if (env.turn.kind === 'cloudflare') {
    return new CloudflareIceServerProvider({ appId: env.turn.appId, token: env.turn.token });
  }
  return new StaticIceServerProvider(env.turn.servers);
}

/**
 * Boot a standalone signaling server. Production callers (the CLI in
 * `main()`) pass parsed env. Tests pass synthetic env + an `override.claims`
 * (in-memory) and let the storage code path stay untouched.
 */
export async function startStandalone(
  env: StandaloneEnv,
  override: StartStandaloneOverride = {}
): Promise<StartStandaloneResult> {
  if (!('Bun' in globalThis)) {
    throw new Error('startStandalone currently requires Bun.');
  }

  // Apply any pending SQL migrations before opening the ClaimStore — keeps the
  // standalone bootstrap a single command without a separate `migrate` step.
  // Skipped when the caller injects an in-memory store for tests.
  const migrationsApplied: ReadonlyArray<string> = override.claims
    ? []
    : (await applyPendingMigrations({ sqlitePath: env.sqlitePath })).applied;

  const claims = override.claims ?? (await openSqliteClaimStore(env.sqlitePath));
  const ice = buildIce(env);
  const limiter = new InMemoryRateLimiter();
  const sessions = new Map<string, HubSessionState>();

  function sessionFor(name: string): HubSessionState {
    const lower = name.toLowerCase();
    let s = sessions.get(lower);
    if (!s) {
      if (sessions.size >= env.maxHubs) {
        throw new RangeError(`max hubs (${env.maxHubs}) reached`);
      }
      s = new HubSessionState({ ice });
      sessions.set(lower, s);
    }
    return s;
  }

  // `server` is captured by closure and filled in below — Bun.serve returns
  // synchronously, but the fetch callbacks aren't invoked until after init.
  let server: import('bun').Server<SocketData> | null = null;

  function upgrade(req: Request, data: SocketData): Response {
    if (!server) {
      return new Response('not ready', { status: 503 });
    }
    // Enforce the hub cap here, before accepting the socket — so an over-limit
    // connection gets a clean 503 rather than a 101 followed by a throw in the
    // `open` handler (which would leave the client with a silently-dead socket).
    if (!sessions.has(data.name.toLowerCase()) && sessions.size >= env.maxHubs) {
      return new Response('coordinator at capacity', { status: 503 });
    }
    return server.upgrade(req, { data })
      ? new Response(null, { status: 101 })
      : new Response('Upgrade failed', { status: 426 });
  }

  // `buildApp` already handles hub-resolve + `injectHubMeta` for SPA
  // responses, so the standalone just supplies a raw filesystem fetcher.
  const assets = override.assets ?? (await createFilesystemAssets(env.assetsDir));

  const deps: AppDeps = {
    claims,
    ice,
    ticketSecret: env.ticketSecret,
    allowedOrigins: env.allowedOrigins,
    assets,
    hubUpgrade: (name, req) => Promise.resolve(upgrade(req, { kind: 'hub', name })),
    clientUpgrade: (name, req) =>
      Promise.resolve(
        upgrade(req, {
          kind: 'client',
          name,
          clientIp: clientIpFromRequest(req),
          clientUserAgent: req.headers.get('user-agent') ?? undefined,
        })
      ),
    hubStatus: (name) => {
      const s = sessions.get(name.toLowerCase());
      return Promise.resolve(s ? s.status() : { hubOnline: false, activeSessions: 0 });
    },
    rateLimit: (req, bucket) => limiter.check(req, bucket),
  };

  const app = buildApp(deps);

  // `Bun` is globally available in the Bun runtime — the early `'Bun' in
  // globalThis` guard above narrows callers to that path.
  server = Bun.serve<SocketData>({
    port: env.port,
    hostname: env.host,
    fetch(req) {
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        const data = ws.data;
        const session = sessionFor(data.name);
        if (data.kind === 'hub') {
          session.attachHub(ws, data.name);
        } else {
          // `attachClient` is async because the IceServerProvider may fetch
          // creds. Discard the promise — the WS is already accepted; any send
          // failure is benign and the catch swallows it.
          session
            .attachClient(ws, {
              name: data.name,
              clientIp: data.clientIp,
              clientUserAgent: data.clientUserAgent,
            })
            .catch(() => {
              /* benign — close handler will tidy up */
            });
        }
      },
      message(ws, message) {
        const session = sessions.get(ws.data.name);
        if (!session) {
          return;
        }
        session.handleMessage(ws, toFrame(message)).catch(() => {
          /* benign — close handler will tidy up */
        });
      },
      close(ws) {
        const session = sessions.get(ws.data.name);
        session?.handleClose(ws);
      },
    },
  });

  return { server, migrationsApplied };
}

/**
 * Normalise Bun's WS message arg (string | Buffer | ArrayBuffer | …) into the
 * `string | ArrayBuffer` shape `HubSessionState.handleMessage` accepts.
 */
function toFrame(message: string | Buffer | ArrayBuffer | Uint8Array): string | ArrayBuffer {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return message;
  }
  // Buffer + Uint8Array: copy the relevant slice into a fresh ArrayBuffer so we
  // don't hand out a view that aliases the pool.
  const view = message as Uint8Array;
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

async function main(): Promise<void> {
  const env = parseStandaloneEnv(process.env);
  const { server, migrationsApplied } = await startStandalone(env);
  // server.port is `number | undefined` on Bun (undefined for unix sockets);
  // we configure with a numeric port so the fallback is just typing-defense.
  printBanner(env, server.port ?? env.port, migrationsApplied);
}

/**
 * One-shot startup banner — a single visual block so operators see exactly
 * what's running at a glance.
 */
function printBanner(
  env: StandaloneEnv,
  port: number,
  migrationsApplied: ReadonlyArray<string>
): void {
  const host = env.host === '0.0.0.0' ? 'localhost' : env.host;
  const migrations =
    migrationsApplied.length > 0
      ? `${migrationsApplied.length} applied (${migrationsApplied.join(', ')})`
      : 'up to date';
  const lines = [
    `brika-signaling  →  http://${host}:${port}`,
    `  storage     sqlite (${env.sqlitePath})`,
    `  turn        ${env.turn.kind}`,
    `  assets      ${env.assetsDir}`,
    `  migrations  ${migrations}`,
  ];
  console.log(lines.join('\n'));
}

// Run only when invoked as the CLI entrypoint (not when imported by tests).
if (import.meta.main) {
  await main();
}
