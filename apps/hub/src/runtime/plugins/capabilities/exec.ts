/**
 * Hub-side handler for the `exec.spawn` capability.
 *
 * Strict binary allowlist + output cap + timeout. Stdin not supported.
 * Combines naturally with the env allowlist landed earlier — the spawned
 * process inherits the same filtered env every plugin gets.
 */

import { basename, isAbsolute, resolve, sep } from 'node:path';
import { defineCapability } from '@brika/capabilities';
import { execSpawn as spec } from '@brika/sdk/capabilities';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB per stream

interface ExecScope {
  allowBinaries: ReadonlyArray<string>;
}

/**
 * True iff `command` matches one of the allowed binary specifications.
 * A pattern containing `/` must match the full path; a bare name matches
 * via basename(command).
 */
export function isBinaryAllowed(command: string, allow: ReadonlyArray<string>): boolean {
  for (const pattern of allow) {
    if (pattern.includes('/') || pattern.includes('\\')) {
      if (command === pattern) {
        return true;
      }
    } else if (basename(command) === pattern) {
      return true;
    }
  }
  return false;
}

/** Truncate a buffer/string to MAX_OUTPUT_BYTES, indicating truncation. */
function capOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) {
    return s;
  }
  return `${s.slice(0, MAX_OUTPUT_BYTES)}\n[...output truncated at 1MB]`;
}

/**
 * Resolve a caller-supplied `cwd` against the plugin root, then ensure the
 * result stays inside that root. An undefined cwd defaults to the plugin
 * root. Absolute paths must be inside it; relative paths are joined.
 */
export function resolveCwd(
  pluginRoot: string,
  callerCwd: string | undefined
): string {
  if (callerCwd === undefined) {
    return pluginRoot;
  }
  const canonicalRoot = resolve(pluginRoot);
  const canonicalCwd = isAbsolute(callerCwd)
    ? resolve(callerCwd)
    : resolve(canonicalRoot, callerCwd);
  if (
    canonicalCwd !== canonicalRoot &&
    !canonicalCwd.startsWith(canonicalRoot + sep)
  ) {
    throw new Error(
      `exec.spawn: cwd "${callerCwd}" resolves outside the plugin root "${pluginRoot}".`
    );
  }
  return canonicalCwd;
}

export interface ExecCallbacks {
  /**
   * Spawn a child process. Wired to Bun.spawn in production; tests inject
   * a mock that returns a deterministic { exitCode, signal, stdout, stderr }.
   */
  spawn(opts: {
    command: string;
    args: ReadonlyArray<string>;
    cwd: string | undefined;
    timeoutMs: number;
  }): Promise<{
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>;
}

export function buildExecCapabilities(cb: ExecCallbacks) {
  return [
    defineCapability(spec.spec, async (ctx, args) => {
      const scope = ctx.grantedScope as ExecScope;
      if (!isBinaryAllowed(args.command, scope.allowBinaries)) {
        throw new Error(
          `exec.spawn: binary "${args.command}" is not in this plugin's allow list (${scope.allowBinaries.join(', ') || '(empty)'})`
        );
      }
      // Default cwd to the plugin root and reject any explicit cwd that
      // resolves outside it. Without this guard a granted plugin could
      // run its allow-listed binary against any directory on the host —
      // `git -C /etc init` etc.
      const cwd = resolveCwd(ctx.pluginRoot, args.cwd);
      const out = await cb.spawn({
        command: args.command,
        args: args.args,
        cwd,
        timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      return {
        exitCode: out.exitCode,
        signal: out.signal,
        stdout: capOutput(out.stdout),
        stderr: capOutput(out.stderr),
        timedOut: out.timedOut,
      };
    }),
  ];
}
