/**
 * `node:os` shim for plugin bundles.
 *
 * `compileServerEntry` substitutes every `import 'node:os'` (or named
 * import like `import { platform } from 'node:os'`) for an import of
 * this file. The bundled plugin therefore never touches the real
 * `node:os`, even at runtime — the lockdown's deny-list catches the
 * dynamic-import escape vector, and the static-import path always
 * lands here.
 *
 * Sanitisation policy:
 *   - Truthful for low-risk fingerprinting (`platform()`, `arch()`,
 *     `endianness()`, `EOL`): every npm library branches on these and
 *     would crash on bogus values.
 *   - Sanitised for identifying / sensitive values: hostname, userInfo,
 *     networkInterfaces, uptime, loadavg, totalmem, freemem — return
 *     constants that don't leak the host operator's environment.
 *   - Per-plugin paths (tmpdir, homedir): read from env vars the hub
 *     sets when spawning the plugin process, with safe fallbacks.
 *
 * All exports are synchronous — `node:os` was synchronous and many
 * libraries call it at module load. Async grants live under `ctx.os.*`.
 */

const FALLBACK_TMPDIR = '/tmp';
const FALLBACK_HOMEDIR = '/home/brika-plugin';
const SAFE_HOSTNAME = 'brika-plugin';
const SAFE_USERNAME = 'brika-plugin';
const FALLBACK_CPU_COUNT = 4;

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function readNonEmpty(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : fallback;
}

/**
 * Values are read from env on every call rather than cached at module
 * load. The cost is negligible (env reads are O(1)) and it means a test
 * can drive the shim with different values without re-evaluating the
 * module — important since Bun's loader caches modules per URL.
 */
function getTmpdir(): string {
  return readNonEmpty('BRIKA_PLUGIN_TMPDIR', FALLBACK_TMPDIR);
}
function getHomedir(): string {
  return readNonEmpty('BRIKA_PLUGIN_HOMEDIR', FALLBACK_HOMEDIR);
}
function getHostname(): string {
  return readNonEmpty('BRIKA_PLUGIN_HOSTNAME', SAFE_HOSTNAME);
}
function getCpuCount(): number {
  return readPositiveInt('BRIKA_PLUGIN_CPU_COUNT', FALLBACK_CPU_COUNT);
}

export const EOL: string = process.platform === 'win32' ? '\r\n' : '\n';

export function platform(): NodeJS.Platform {
  return process.platform;
}

export function arch(): string {
  return process.arch;
}

/** Every supported Bun target is little-endian. */
export function endianness(): 'LE' | 'BE' {
  return 'LE';
}

export function hostname(): string {
  return getHostname();
}

export function tmpdir(): string {
  return getTmpdir();
}

export function homedir(): string {
  return getHomedir();
}

export interface UserInfo {
  readonly uid: number;
  readonly gid: number;
  readonly username: string;
  readonly homedir: string;
  readonly shell: string | null;
}

export function userInfo(_opts?: { encoding?: string }): UserInfo {
  return {
    uid: -1,
    gid: -1,
    username: SAFE_USERNAME,
    homedir: getHomedir(),
    shell: null,
  };
}

export interface CpuInfo {
  readonly model: string;
  readonly speed: number;
  readonly times: {
    readonly user: number;
    readonly nice: number;
    readonly sys: number;
    readonly idle: number;
    readonly irq: number;
  };
}

/**
 * Return a synthetic core list — count is honest (libraries size worker
 * pools off this), model and timings are sanitised.
 */
export function cpus(): CpuInfo[] {
  const count = getCpuCount();
  const out: CpuInfo[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      model: '',
      speed: 0,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    });
  }
  return out;
}

export function availableParallelism(): number {
  return getCpuCount();
}

// Memory / uptime / load are sanitised — exposing real values leaks host
// fingerprint and lets a plugin time-correlate other tenants.
export function totalmem(): number {
  return 0;
}
export function freemem(): number {
  return 0;
}
export function uptime(): number {
  return 0;
}
export function loadavg(): [number, number, number] {
  return [0, 0, 0];
}

/** Network interfaces are always {} — plugins use `ctx.net.fetch` for I/O. */
export function networkInterfaces(): Record<string, never[]> {
  return {};
}

export function type(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Darwin';
    case 'win32':
      return 'Windows_NT';
    default:
      return 'Linux';
  }
}

export function release(): string {
  return 'sanitized';
}

export function version(): string {
  return 'sanitized';
}

export function machine(): string {
  return process.arch;
}

/**
 * Aggregated default export. Matches `import os from 'node:os'` form.
 * Each property is the same function instance the named exports reference,
 * so `os.platform === platform` holds (libraries occasionally rely on
 * function identity to detect monkey-patching).
 */
const osDefault = {
  EOL,
  platform,
  arch,
  endianness,
  hostname,
  tmpdir,
  homedir,
  userInfo,
  cpus,
  availableParallelism,
  totalmem,
  freemem,
  uptime,
  loadavg,
  networkInterfaces,
  type,
  release,
  version,
  machine,
};

export default osDefault;
