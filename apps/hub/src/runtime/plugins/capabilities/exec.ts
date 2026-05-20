/**
 * Hub-side handler for the `exec.spawn` capability.
 *
 * Strict binary allowlist + output cap + timeout. Stdin not supported.
 * Combines naturally with the env allowlist landed earlier — the spawned
 * process inherits the same filtered env every plugin gets.
 */

import { basename } from 'node:path';
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
      const out = await cb.spawn({
        command: args.command,
        args: args.args,
        cwd: args.cwd,
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
