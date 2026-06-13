/**
 * Runtime mode detection.
 *
 * Different deployment shapes need different update strategies:
 *
 *   - `dev`             — running from source via `bun run`; updates are nonsensical
 *   - `standalone`      — single `bun --compile` binary in `~/.brika/bin`; can self-update
 *   - `supervised`      — running under systemd / launchd / docker `restart: unless-stopped`;
 *                         can stage a new binary but must let the supervisor restart us
 *   - `container`       — inside a Docker / OCI container; updates must come from a new image
 *   - `system-package`  — installed via apt / rpm / brew; the package manager owns the binary
 *
 * Detection is best-effort with explicit overrides:
 *
 *   1. `BRIKA_RUNTIME_MODE=<mode>` always wins (operators with weird setups)
 *   2. `/.dockerenv` or `container` env → container
 *   3. systemd / launchd env hints → supervised
 *   4. binary in `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin` → system-package
 *   5. not a compiled binary → dev
 *   6. fallback → standalone
 */

import { existsSync } from 'node:fs';
import { isCompiledFrom } from '@brika/sdk/exec-context';
import { z } from 'zod';

const RuntimeModeSchema = z.enum([
  'dev',
  'standalone',
  'supervised',
  'container',
  'system-package',
]);

export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

const SYSTEM_PACKAGE_PREFIXES = [
  '/usr/bin/',
  '/usr/local/bin/',
  '/usr/sbin/',
  '/opt/homebrew/bin/',
  '/opt/homebrew/sbin/',
];

interface DetectInput {
  /** `import.meta.path.startsWith('/$bunfs/')` — true when running from a `bun build --compile` binary. */
  readonly isCompiled: boolean;
  /** Usually `process.execPath`. Passed in so tests can fake it. */
  readonly execPath: string;
  /** Env subset relevant to detection. Tests pass `{}` for a clean room. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Existence check for `/.dockerenv`. Tests pass a stub. */
  readonly dockerEnvExists: () => boolean;
}

/**
 * Pure detection logic. Exposed for testing; production callers use
 * {@link detectRuntimeMode}, which closes over the real environment.
 */
export function computeRuntimeMode(input: DetectInput): RuntimeMode {
  const override = input.env.BRIKA_RUNTIME_MODE;
  if (override !== undefined) {
    const parsed = RuntimeModeSchema.safeParse(override);
    if (parsed.success) {
      return parsed.data;
    }
    // Unknown override falls through to auto-detection rather than throwing —
    // a typo in an env var shouldn't brick the hub on startup.
  }

  if (input.dockerEnvExists() || input.env.container !== undefined) {
    return 'container';
  }

  if (input.env.SYSTEMD_EXEC_PID !== undefined || input.env.LAUNCHD_SOCKET !== undefined) {
    return 'supervised';
  }

  // A package-manager install (the launcher exports BRIKA_INSTALL=npm for any of
  // npm/pnpm/yarn/bun) is manager-owned, like a system package: refuse in-place
  // self-update and let the package manager own the binary. The cached binary
  // lives under the data dir, not a system prefix, so without this it would
  // misdetect as `standalone`.
  if (input.env.BRIKA_INSTALL === 'npm') {
    return 'system-package';
  }

  if (SYSTEM_PACKAGE_PREFIXES.some((p) => input.execPath.startsWith(p))) {
    return 'system-package';
  }

  if (!input.isCompiled) {
    return 'dev';
  }

  return 'standalone';
}

export function detectRuntimeMode(): RuntimeMode {
  return computeRuntimeMode({
    isCompiled: isCompiledFrom(import.meta.path),
    execPath: process.execPath,
    env: process.env,
    dockerEnvExists: () => existsSync('/.dockerenv'),
  });
}

/**
 * Whether the current runtime can perform an in-place update at all.
 * `container` and `system-package` modes refuse — the operator must
 * update via their package manager / image pull instead. `dev` also
 * refuses (there's no compiled binary to replace), matching the
 * synchronous `canApply()` behavior of {@link DevStrategy}.
 */
export function canSelfUpdate(mode: RuntimeMode): boolean {
  return mode === 'standalone' || mode === 'supervised';
}
