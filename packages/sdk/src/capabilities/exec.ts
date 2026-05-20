/**
 * Process execution capability.
 *
 * The riskiest capability — disabled for most plugins. The grant scope MUST
 * list the exact executable names the plugin is allowed to spawn; anything
 * outside the list is rejected. Argument injection is also gated: if the
 * binary appears in `allowArgs`, only those argv patterns may be passed.
 *
 * Stdin is not supported. Stdout/stderr are captured up to a 1MB cap. The
 * spawned process gets a stripped environment (only PATH/HOME from the
 * already-filtered plugin env).
 *
 * Long-term, this capability should disappear in favor of more specific
 * capabilities (`ctx.git.clone(...)` etc.) — exec is a stopgap.
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

const ExecSpawnArgs = z.object({
  /** Absolute path or `PATH`-resolved name of the binary to spawn. */
  command: z.string().min(1),
  /** Arguments. The hub enforces the per-binary `allowArgs` pattern if set. */
  args: z.array(z.string()).default([]),
  /** Working directory; defaults to plugin root. Must be inside fs scope. */
  cwd: z.string().optional(),
  /** Per-call deadline in milliseconds; capped at 300000 (5 min). */
  timeoutMs: z.number().int().positive().max(300_000).optional(),
});

const ExecSpawnResult = z.object({
  /** Process exit code; null if killed by a signal or timeout. */
  exitCode: z.number().int().nullable(),
  /** Signal name if killed; null otherwise. */
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  /** True iff the deadline expired before the process exited. */
  timedOut: z.boolean(),
});

export const execSpawn = defineCapability(
  {
    id: 'dev.brika.exec.spawn',
    ctxPath: 'exec.spawn',
    args: ExecSpawnArgs,
    result: ExecSpawnResult,
    description: 'Run an allow-listed binary and capture its output',
    permission: {
      name: 'exec',
      scope: z.object({
        /**
         * Binary names (or absolute paths) the plugin may spawn. Empty list
         * = grant exists but allows nothing. Wildcards are NOT supported —
         * every binary must be explicitly listed.
         */
        allowBinaries: z.array(z.string()).default([]),
      }),
      defaultScope: { allowBinaries: [] },
      icon: 'terminal',
    },
  },
  () => {
    throw new Error('exec.spawn handler is not registered.');
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    exec: {
      spawn(args: z.input<typeof ExecSpawnArgs>): Promise<z.infer<typeof ExecSpawnResult>>;
    };
  }
}
