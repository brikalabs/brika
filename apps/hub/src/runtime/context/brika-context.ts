/**
 * BrikaContext — single source of truth for "facts about this Brika
 * instance" available before any plugin or service is wired.
 *
 * Resolved once at module load:
 *
 *   - filesystem layout (brikaDir, rootDir, installDir, dbDir, …)
 *   - identity (instanceId, serviceName) — persisted to instance.id
 *   - build info (version, gitSha, isCompiled)
 *   - host info (platform)
 *
 * Consumers should import the frozen `brikaContext` object instead of
 * computing paths or reading env themselves. Eager evaluation means
 * the value is stable across the process lifetime (no surprise drift
 * if `process.cwd()` changes mid-run).
 *
 * `instance.id` is generated on first access — wiping `${brikaDir}` and
 * restarting yields a fresh UID and therefore a fresh Keychain bucket.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pkg from '../../../package.json' with { type: 'json' };
import { buildInfo } from '../../build-info';

const isCompiled = import.meta.path.startsWith('/$bunfs/');
const installDir = dirname(process.execPath);

/** 8 hex chars = 4 bytes of randomness, ~4 billion buckets. Plenty. */
const INSTANCE_ID_BYTES = 4;
const INSTANCE_ID_FILE = 'instance.id';
const INSTANCE_ID_RE = /^[0-9a-f]{8}$/;

/** Reverse-DNS bundle ID base for Keychain entries. */
const KEYCHAIN_SERVICE_BASE = 'dev.brika.hub';

function resolveBrikaDir(): string {
  const autoDetected = isCompiled ? dirname(installDir) : join(process.cwd(), '.brika');
  return process.env.BRIKA_HOME ?? autoDetected;
}

function readOrGenerateInstanceId(brikaDir: string): string {
  const path = join(brikaDir, INSTANCE_ID_FILE);
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim();
    if (INSTANCE_ID_RE.test(raw)) {
      return raw;
    }
    // Corrupt contents — fall through to regenerate. Old Keychain
    // entries become orphaned but are harmless until the user cleans
    // them manually.
  }
  const fresh = randomBytes(INSTANCE_ID_BYTES).toString('hex');
  mkdirSync(brikaDir, { recursive: true });
  writeFileSync(path, fresh, { encoding: 'utf8', mode: 0o600 });
  return fresh;
}

const brikaDir = resolveBrikaDir();
const instanceId = readOrGenerateInstanceId(brikaDir);

export interface BrikaContext {
  // ─── Filesystem ──────────────────────────────────────────────────
  /** Per-install data directory. `${BRIKA_HOME}` or auto-detected. */
  readonly brikaDir: string;
  /** Parent of `brikaDir` — workspace root (dev) or binary parent (compiled). */
  readonly rootDir: string;
  /** Directory containing the running binary. */
  readonly installDir: string;
  /** `${brikaDir}/plugins/node_modules` — registry-installed plugins. */
  readonly pluginsDir: string;
  /** `${brikaDir}/db` — SQLite databases (cache, logs, auth, …). */
  readonly dbDir: string;

  // ─── Identity ────────────────────────────────────────────────────
  /** Stable 8-hex UID for THIS `${brikaDir}`. Survives across restarts. */
  readonly instanceId: string;
  /** Reverse-DNS Keychain service name: `dev.brika.hub.<instanceId>`. */
  readonly serviceName: string;

  // ─── Build ───────────────────────────────────────────────────────
  /** `apps/hub/package.json` version. */
  readonly version: string;
  /** Git short SHA at build time (empty string in untagged sources). */
  readonly gitSha: string;
  /** Full git commit. */
  readonly gitCommit: string;
  /** ISO date the binary was built (or transpiled in dev). */
  readonly buildDate: string;
  /** Running from a `bun build --compile` binary vs source. */
  readonly isCompiled: boolean;

  // ─── Host ────────────────────────────────────────────────────────
  readonly platform: NodeJS.Platform;
}

export const brikaContext: BrikaContext = Object.freeze({
  brikaDir,
  rootDir: dirname(brikaDir),
  installDir,
  pluginsDir: join(brikaDir, 'plugins', 'node_modules'),
  dbDir: join(brikaDir, 'db'),

  instanceId,
  serviceName: `${KEYCHAIN_SERVICE_BASE}.${instanceId}`,

  version: pkg.version,
  gitSha: buildInfo.commit,
  gitCommit: buildInfo.commitFull,
  buildDate: buildInfo.date,
  isCompiled,

  platform: process.platform,
});
