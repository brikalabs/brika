/**
 * OS-level plugin sandboxing (L3 isolation).
 *
 * Layer 1 + 2 of the sandbox (JS lockdown + grant-mediated I/O) are
 * always on. This module adds the third layer: the OS kernel itself
 * refuses to hand out capabilities the plugin doesn't have, even if
 * a sandbox escape in L1/L2 happens. Defence in depth.
 *
 * The launcher abstraction is platform-agnostic. macOS uses
 * `sandbox-exec` with a scope-derived profile; Linux will use
 * landlock + seccomp (currently a no-op pending kernel-bindings
 * implementation); Windows is no-op.
 */

/**
 * Profile derived from the plugin's manifest + permits, plus the
 * backing dirs the hub picked for the four virtual roots. The
 * launcher uses these to produce a platform-specific sandbox
 * profile that opens up only what the scope asks for.
 */
export interface SandboxProfile {
  /** Stable identifier — the plugin's uid is fine. */
  readonly pluginUid: string;
  /** Absolute paths the plugin needs to read. */
  readonly readableDirs: ReadonlyArray<string>;
  /** Absolute paths the plugin needs to read AND write. */
  readonly writableDirs: ReadonlyArray<string>;
  /**
   * Whether the plugin is granted outbound network access. The
   * grant vector mediates the actual fetches at L2; this flag
   * controls whether the kernel even lets a socket open.
   */
  readonly allowNetwork: boolean;
}

export type SandboxMode = 'enforce' | 'permissive' | 'off';

export interface SandboxLaunchPlan {
  /** Executable to invoke. May be a wrapper (sandbox-exec, prlimit, …). */
  readonly cmd: string;
  /** Arguments. The original `[bunBin, ...args]` is embedded. */
  readonly args: ReadonlyArray<string>;
}

/**
 * Platform launcher. Each implementation takes the original spawn
 * command + profile, returns a `SandboxLaunchPlan` the hub's
 * `Bun.spawn` call can pass straight in.
 */
export interface SandboxLauncher {
  /** Human-friendly name surfaced in logs / telemetry. */
  readonly name: string;
  /** Compute the spawn command for `cmd + args` under the profile. */
  wrap(cmd: string, args: ReadonlyArray<string>, profile: SandboxProfile): SandboxLaunchPlan;
}
