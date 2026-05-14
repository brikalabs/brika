/**
 * Best-effort port detection for `health: auto`. Two paths:
 *
 *   - {@link listListeningPorts}: walks the spawned PID tree via
 *     `pgrep -P` and asks `lsof` which TCP ports they own. Strict
 *     and specific — but fails when wrappers re-exec or detach.
 *   - {@link isPortListening}: cheap "is this exact port bound by
 *     anyone?" check, used by the supervisor's log-port confirmation
 *     path and crashed-recovery probe.
 *
 * Why lsof and not `/proc/<pid>/net/tcp`? Portability: macOS doesn't
 * have procfs, and lsof's `-F` machine-output mode is stable enough
 * to parse with a one-line regex on every supported platform.
 *
 * Heuristic methods can never be fully reliable — for the authoritative
 * answer, the user should declare `port:` on the service in `mortar.yml`.
 */

import { HEALTH_POLL_INTERVAL_MS } from '../constants';
import { HealthCheckTimeoutError, MissingToolError } from '../errors';
import { pollUntil } from '../time';

/**
 * Resolve once any listening TCP port appears for `pid` (or any
 * descendant). Throws {@link HealthCheckTimeoutError} on deadline and
 * {@link MissingToolError} if lsof/pgrep aren't on PATH.
 */
export async function waitForListeningPort(
  pid: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<number> {
  await preflight();
  return pollUntil(
    async () => {
      const ports = await listListeningPorts(pid);
      if (ports.length === 0) {
        throw new Error('no listening ports yet');
      }
      // Vite, fastify, express et al. bind their primary port first;
      // when a service binds more than one, the lowest-numbered is
      // almost always the intended user-facing port.
      return ports[0] as number;
    },
    {
      timeoutMs,
      intervalMs: HEALTH_POLL_INTERVAL_MS,
      signal,
      errorMessage: (cause) =>
        new HealthCheckTimeoutError('auto', String(pid), timeoutMs, cause).message,
    }
  );
}

/**
 * Sorted ascending list of TCP ports the PID (and ANY of its
 * descendants) is currently listening on. Empty array when nothing's
 * bound or the process is gone.
 */
export async function listListeningPorts(pid: number): Promise<number[]> {
  const pids = await collectPidTree(pid);
  if (pids.length === 0) {
    return [];
  }
  const ports = await lsofListeningPorts(pids);
  return Array.from(new Set(ports)).sort((a, b) => a - b);
}

/**
 * True when ANY process on this host is listening on `port`. Used by
 * the supervisor to (a) verify a port advertised in a service's log
 * stream is actually bound and (b) decide whether a service that
 * "looked crashed" is actually still serving (wrapper exited but the
 * runtime it supervised is still up).
 */
export async function isPortListening(port: number): Promise<boolean> {
  try {
    const proc = Bun.spawn(['lsof', '-aP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'n'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text.includes(`:${port}`);
  } catch {
    return false;
  }
}

/**
 * BFS the process tree starting at `root`, returning `root` + every
 * descendant currently alive. Uses `pgrep -P <pid>` at each level.
 */
export async function collectPidTree(root: number): Promise<number[]> {
  const out: number[] = [];
  const queue = [root];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const pid = queue.shift();
    if (pid === undefined || seen.has(pid)) {
      continue;
    }
    seen.add(pid);
    out.push(pid);
    try {
      queue.push(...(await pgrepChildren(pid)));
    } catch {
      // `pgrep` exits 1 when no children; treat as leaf.
    }
  }
  return out;
}

// ─── Preflight ──────────────────────────────────────────────────────────────

let preflighted = false;
let preflightError: Error | null = null;

/**
 * Verify `lsof` and `pgrep` are on PATH on the first call. Memoizes
 * the result so polling doesn't re-spawn `which` 1000 times.
 */
async function preflight(): Promise<void> {
  if (preflighted) {
    if (preflightError) {
      throw preflightError;
    }
    return;
  }
  for (const tool of ['lsof', 'pgrep'] as const) {
    try {
      const proc = Bun.spawn(['which', tool], { stdout: 'ignore', stderr: 'ignore' });
      const code = await proc.exited;
      if (code !== 0) {
        preflightError = new MissingToolError(tool);
        preflighted = true;
        throw preflightError;
      }
    } catch (err) {
      if (err instanceof MissingToolError) {
        throw err;
      }
      // `which` itself missing — extremely unusual; surface as missing tool.
      preflightError = new MissingToolError(tool);
      preflighted = true;
      throw preflightError;
    }
  }
  preflighted = true;
}

/** Test-only: reset memoized preflight so each test gets a fresh check. */
export function resetPreflightForTesting(): void {
  preflighted = false;
  preflightError = null;
}

// ─── Subprocess helpers ────────────────────────────────────────────────────

async function pgrepChildren(parent: number): Promise<number[]> {
  const proc = Bun.spawn(['pgrep', '-P', String(parent)], {
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text
    .split('\n')
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Run `lsof -aP -p <pids> -iTCP -sTCP:LISTEN -F n` and parse the
 * machine-output mode. `-F n` gives one record per port; the `n`
 * lines look like:
 *
 *   p1234
 *   n*:5173
 *   n[::1]:5174
 *
 * `*` means "any address"; bracketed v6 hosts are parsed by reading
 * everything after the last colon. Returns every port found
 * (deduplicated by the caller).
 */
async function lsofListeningPorts(pids: readonly number[]): Promise<number[]> {
  const proc = Bun.spawn(
    ['lsof', '-aP', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN', '-F', 'n'],
    { stdout: 'pipe', stderr: 'ignore' }
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const ports: number[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('n')) {
      continue;
    }
    const addr = line.slice(1);
    const colon = addr.lastIndexOf(':');
    if (colon < 0) {
      continue;
    }
    const port = Number.parseInt(addr.slice(colon + 1), 10);
    if (Number.isFinite(port) && port > 0 && port <= 65_535) {
      ports.push(port);
    }
  }
  return ports;
}
