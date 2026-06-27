/**
 * BrikaContext - single source of truth for "facts about this Brika
 * instance" available before any plugin or service is wired.
 *
 * Resolved once at module load:
 *
 *   - filesystem layout (brikaDir, rootDir, installDir, dbDir, …)
 *   - identity (instanceId, serviceName) - persisted to instance.id
 *   - build info (version, gitSha, isCompiled)
 *   - host info (platform)
 *
 * Consumers should import the frozen `brikaContext` object instead of
 * computing paths or reading env themselves. Eager evaluation means
 * the value is stable across the process lifetime (no surprise drift
 * if `process.cwd()` changes mid-run).
 *
 * `instance.id` is generated on first access - wiping `${brikaDir}` and
 * restarting yields a fresh UID and therefore a fresh Keychain bucket.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isCompiledFrom, resolveDataDir, resolveSystemDir } from '@brika/sdk/exec-context';
import { buildInfo } from '../../build-info';
import { relocateLegacyLayout } from './layout';

const isCompiled = isCompiledFrom(import.meta.path);
const installDir = dirname(process.execPath);

/** 8 hex chars = 4 bytes of randomness, ~4 billion buckets. Plenty. */
const INSTANCE_ID_BYTES = 4;
const INSTANCE_ID_FILE = 'instance.id';
const INSTANCE_ID_RE = /^[0-9a-f]{8}$/;

/** Reverse-DNS bundle ID base for Keychain entries. */
const KEYCHAIN_SERVICE_BASE = 'dev.brika.hub';

/**
 * The data dir, via the shared @brika/sdk/exec-context resolver (the single
 * source of truth shared with the console CLI and the lean bin). Dev resolves to
 * the workspace-root `.brika` regardless of launch cwd, so a `mortar up` hub
 * (cwd: apps/hub) and `brika install` agree on one dir.
 */
function resolveBrikaDir(): string {
  return resolveDataDir({
    env: process.env,
    isCompiled,
    execPath: process.execPath,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
  }).path;
}

function readOrGenerateInstanceId(systemDir: string): string {
  const path = join(systemDir, INSTANCE_ID_FILE);
  let staleId: string | null = null;
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim();
    if (INSTANCE_ID_RE.test(raw)) {
      return raw;
    }
    // Corrupt contents - fall through to regenerate.
    staleId = raw || null;
  }
  const fresh = randomBytes(INSTANCE_ID_BYTES).toString('hex');
  mkdirSync(systemDir, { recursive: true });
  writeFileSync(path, fresh, { encoding: 'utf8', mode: 0o600 });
  // The structured Logger isn't wired yet at module load - and this is the
  // module that gives the logger its serviceName - so warn via console. The
  // user is otherwise blind to the fact that they just orphaned a whole
  // keychain namespace.
  const stalePart = staleId ? ` (previous file held "${staleId}")` : ' (no previous instance.id)';
  console.warn(
    `[brika] Generated a fresh instance.id "${fresh}" in ${systemDir}${stalePart}. ` +
      `Any keychain entries under "${KEYCHAIN_SERVICE_BASE}.<previous>" are now orphaned ` +
      `and won't be read by this hub - clean them up via Keychain Access or ` +
      `\`security delete-generic-password -s ${KEYCHAIN_SERVICE_BASE}.<previous>\`.`
  );
  return fresh;
}

const brikaDir = resolveBrikaDir();
const systemDir = resolveSystemDir(brikaDir);
// Migrate older flat installs into `.system/` once, before anything reads a
// relocated path (instance.id below is the first such read).
relocateLegacyLayout(brikaDir, systemDir);
const instanceId = readOrGenerateInstanceId(systemDir);

export interface BrikaContext {
  // ─── Filesystem ──────────────────────────────────────────────────
  /** Per-install data directory. `${BRIKA_HOME}` or auto-detected. */
  readonly brikaDir: string;
  /** Parent of `brikaDir` - workspace root (dev) or binary parent (compiled). */
  readonly rootDir: string;
  /**
   * `${brikaDir}/.system` - the hidden folder holding everything the hub
   * manages (db, plugins, identity, update state, secrets, runtime). Only
   * `brika.yml`, `boards/` and `workflows/` stay at `brikaDir` itself.
   */
  readonly systemDir: string;
  /** Directory containing the running binary. */
  readonly installDir: string;
  /** `${systemDir}/plugins/node_modules` - registry-installed plugins. */
  readonly pluginsDir: string;
  /** `${systemDir}/db` - SQLite databases (cache, logs, auth, …). */
  readonly dbDir: string;

  // ─── Identity ────────────────────────────────────────────────────
  /** Stable 8-hex UID for THIS `${brikaDir}`. Survives across restarts. */
  readonly instanceId: string;
  /** Reverse-DNS Keychain service name: `dev.brika.hub.<instanceId>`. */
  readonly serviceName: string;

  // ─── Build ───────────────────────────────────────────────────────
  /** Build-time version. CI sets `BRIKA_VERSION`; dev falls back to `apps/hub/package.json`. */
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
  systemDir,
  installDir,
  pluginsDir: join(systemDir, 'plugins', 'node_modules'),
  dbDir: join(systemDir, 'db'),

  instanceId,
  serviceName: `${KEYCHAIN_SERVICE_BASE}.${instanceId}`,

  version: buildInfo.version,
  gitSha: buildInfo.commit,
  gitCommit: buildInfo.commitFull,
  buildDate: buildInfo.date,
  isCompiled,

  platform: process.platform,
});
