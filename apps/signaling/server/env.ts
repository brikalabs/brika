/**
 * Schema-derived environment for both signaling deployments.
 *
 * `EnvSchema`           — Cloudflare Worker env (CF bindings + secrets).
 * `StandaloneEnvSchema` — Bun env (process.env). Parsed once at startup and
 *                         exits the process on failure.
 *
 * Workers has no startup hook that sees `env` (it arrives per-request), so
 * `checkEnv` parses on the first request and short-circuits thereafter — the
 * warm path is a single boolean read.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IceServer } from '@brika/remote-access-protocol';
import { z } from 'zod';

const binding = <T>(label: string) =>
  z.custom<T>((v) => v != null && typeof v === 'object', `${label} missing`);

export const EnvSchema = z.object({
  HUB_SESSION: binding<DurableObjectNamespace>('HUB_SESSION'),
  DB: binding<D1Database>('DB'),
  ASSETS: binding<Fetcher>('ASSETS'),
  TICKET_SECRET: z.string().min(16, 'TICKET_SECRET must be ≥16 chars (see .dev.vars.example)'),
  ALLOWED_ORIGINS: z.string().optional(),
  CF_REALTIME_APP_ID: z.string().optional(),
  CF_REALTIME_APP_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let validated = false;

/** Parse env once per isolate. Returns a 500 response on failure, `null` on success. */
export function checkEnv(env: unknown): Response | null {
  if (validated) {
    return null;
  }
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return Response.json({ error: 'env-misconfigured', detail }, { status: 500 });
  }
  validated = true;
  return null;
}

// ─── Standalone env ─────────────────────────────────────────────────────────

const StandaloneEnvSchema = z.object({
  BRIKA_SIGNALING_SQLITE_PATH: z.string().default('./brika-signaling.db'),
  BRIKA_SIGNALING_TURN: z.enum(['static', 'cloudflare', 'none']).default('static'),
  BRIKA_SIGNALING_TURN_STATIC: z.string().default('[]'),
  BRIKA_SIGNALING_PORT: z.coerce.number().int().positive().default(8787),
  BRIKA_SIGNALING_HOST: z.string().default('0.0.0.0'),
  BRIKA_SIGNALING_ASSETS_DIR: z.string().default('./dist/client'),
  BRIKA_SIGNALING_MAX_HUBS: z.coerce.number().int().positive().default(1000),
  // Optional at the env layer; `resolveTicketSecret` upgrades to a persisted
  // dev secret when missing and not in production.
  TICKET_SECRET: z.string().min(16, 'TICKET_SECRET must be ≥16 chars').optional(),
  NODE_ENV: z.string().optional(),
  BRIKA_SIGNALING_PRODUCTION: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  CF_REALTIME_APP_ID: z.string().optional(),
  CF_REALTIME_APP_TOKEN: z.string().optional(),
});

export interface StandaloneEnv {
  readonly sqlitePath: string;
  readonly turn:
    | { kind: 'static'; servers: ReadonlyArray<IceServer> }
    | { kind: 'cloudflare'; appId: string; token: string }
    | { kind: 'none' };
  readonly port: number;
  readonly host: string;
  readonly assetsDir: string;
  readonly maxHubs: number;
  readonly ticketSecret: string;
  readonly allowedOrigins: readonly string[] | undefined;
}

/**
 * Parse `process.env` into a resolved {@link StandaloneEnv}. Logs every Zod
 * issue and calls `process.exit(1)` on failure — startup is the only place
 * standalone code reads env, so fail-loud is the right shape.
 */
export function parseStandaloneEnv(source: Record<string, string | undefined>): StandaloneEnv {
  const parsed = StandaloneEnvSchema.safeParse(source);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(`[env] ${issue.path.join('.') || '<root>'}: ${issue.message}`);
    }
    process.exit(1);
  }
  const v = parsed.data;
  return {
    sqlitePath: v.BRIKA_SIGNALING_SQLITE_PATH,
    turn: resolveTurn(v),
    port: v.BRIKA_SIGNALING_PORT,
    host: v.BRIKA_SIGNALING_HOST,
    assetsDir: v.BRIKA_SIGNALING_ASSETS_DIR,
    maxHubs: v.BRIKA_SIGNALING_MAX_HUBS,
    ticketSecret: resolveTicketSecret(v.TICKET_SECRET, {
      production:
        v.NODE_ENV === 'production' ||
        v.BRIKA_SIGNALING_PRODUCTION === '1' ||
        v.BRIKA_SIGNALING_PRODUCTION === 'true',
      sqlitePath: v.BRIKA_SIGNALING_SQLITE_PATH,
    }),
    allowedOrigins: v.ALLOWED_ORIGINS
      ? v.ALLOWED_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  };
}

/**
 * Resolve the HMAC ticket secret.
 *
 * Production (NODE_ENV=production or BRIKA_SIGNALING_PRODUCTION=1/true):
 *   the env value is required; missing/short → exit(1).
 *
 * Dev (default): if the env value is missing, read/create a persisted
 *   `.signaling-secret` file next to the SQLite DB. Print a banner so the
 *   developer notices. Subsequent runs reuse the same secret, so ticket
 *   continuity survives restarts.
 */
function resolveTicketSecret(
  envValue: string | undefined,
  options: { production: boolean; sqlitePath: string }
): string {
  if (envValue && envValue.length >= 16) {
    return envValue;
  }
  if (options.production) {
    console.error('[env] TICKET_SECRET is required in production (≥16 chars).');
    process.exit(1);
  }
  // Stash the dev secret next to the SQLite DB so a `rm` of the data dir wipes
  // both the claims and the secret together — no orphaned tickets pointing at
  // deleted claims.
  const secretPath = resolve(dirname(resolve(options.sqlitePath)), '.signaling-secret');
  if (existsSync(secretPath)) {
    const cached = readFileSync(secretPath, 'utf-8').trim();
    if (cached.length >= 16) {
      return cached;
    }
  }
  const generated = randomHex(32);
  mkdirSync(dirname(secretPath), { recursive: true });
  writeFileSync(secretPath, generated, { mode: 0o600 });
  console.warn(
    `[brika-signaling] No TICKET_SECRET set — generated a dev secret and stored it at ${secretPath}.`
  );
  console.warn('[brika-signaling] Set TICKET_SECRET explicitly before deploying to production.');
  return generated;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let hex = '';
  for (const b of buf) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

function resolveTurn(v: z.infer<typeof StandaloneEnvSchema>): StandaloneEnv['turn'] {
  if (v.BRIKA_SIGNALING_TURN === 'none') {
    return { kind: 'none' };
  }
  if (v.BRIKA_SIGNALING_TURN === 'cloudflare') {
    if (!v.CF_REALTIME_APP_ID || !v.CF_REALTIME_APP_TOKEN) {
      console.error(
        '[env] CF_REALTIME_APP_ID and CF_REALTIME_APP_TOKEN are required when TURN=cloudflare'
      );
      process.exit(1);
    }
    return { kind: 'cloudflare', appId: v.CF_REALTIME_APP_ID, token: v.CF_REALTIME_APP_TOKEN };
  }
  let servers: IceServer[];
  try {
    const raw = JSON.parse(v.BRIKA_SIGNALING_TURN_STATIC) as unknown;
    if (!Array.isArray(raw)) {
      throw new TypeError('BRIKA_SIGNALING_TURN_STATIC must be a JSON array of IceServer');
    }
    servers = raw as IceServer[];
  } catch (err) {
    console.error(`[env] BRIKA_SIGNALING_TURN_STATIC parse error: ${(err as Error).message}`);
    process.exit(1);
  }
  return { kind: 'static', servers };
}
