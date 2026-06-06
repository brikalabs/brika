/**
 * macOS `sandbox-exec` profile generation.
 *
 * Produces a Sandbox Profile Language (SBPL) string a hub passes via
 * `sandbox-exec -p '(version 1)(deny default)…' -- bun …`. The
 * profile defaults to "deny everything" and explicitly allows only
 * what Bun's runtime + the plugin's scope require.
 *
 * SBPL is documented in Apple's TN2206 + the `sandbox-exec` source
 * (now removed from public Apple docs but still functional). The
 * profile below has been tested with macOS 13–14. Note that
 * `sandbox-exec` itself is deprecated; if Apple removes it in a
 * future release the runtime falls back to the no-op launcher
 * cleanly (it just doesn't add the wrapper).
 *
 * Pure module: no I/O, no async. Easy to unit-test against expected
 * SBPL output.
 */

import type { SandboxProfile } from './types';

/**
 * Always-on rules — required for Bun's runtime to even start under
 * the sandbox. These cover process lifecycle, mach services, sysctl,
 * and broad file READS. The L2 grant vector enforces what the
 * plugin can actually access via `ctx.fs.*`; tightening reads at
 * the kernel level would require per-Bun-version dyld tracing and
 * is intentionally deferred. The L3 security benefit is the WRITE
 * constraint added per profile + the absence of process-exec
 * escape paths (the L1 `Bun.spawn` scrub blocks plugin-initiated
 * exec; the kernel-level `process-exec*` allow here covers only
 * Bun's own bootstrap).
 */
const STATIC_RULES: ReadonlyArray<string> = [
  '(version 1)',
  '(deny default)',
  '(allow process-fork)',
  '(allow process-exec*)',
  '(allow process-info* (target self))',
  '(allow signal (target self))',
  '(allow ipc-posix-shm*)',
  '(allow iokit-open*)',
  '(allow mach-lookup)',
  '(allow sysctl-read)',
  '(allow file-read*)',
  // Bun's own runtime caches modules and resolves imports through
  // $TMPDIR — denying writes here would crash the plugin at startup.
  '(allow file-write* (subpath "/private/var/folders"))',
  '(allow file-write* (subpath "/private/tmp"))',
];

export function buildMacosProfile(profile: SandboxProfile): string {
  const writeRules = profile.writableDirs.map(
    (dir) => `(allow file-write* (subpath ${quote(dir)}))`
  );
  // Unix sockets are always allowed (hub IPC needs them); `allowNetwork`
  // controls whether we additionally open IP traffic. `network-bind` and
  // `network-inbound` are spelled out explicitly: sandbox-exec treats them as
  // distinct operations that the `network*` glob does not reliably cover, and
  // plugins like Matter must bind the mDNS multicast socket (0.0.0.0:5353).
  const networkRules = profile.allowNetwork
    ? ['(allow network*)', '(allow network-bind)', '(allow network-inbound)']
    : ['(allow network* (local unix))'];
  return [...STATIC_RULES, ...writeRules, ...networkRules].join('\n');
}

/**
 * Escape a path for embedding in SBPL. Backslashes and double quotes
 * are the only characters with special meaning; sandbox-exec doesn't
 * interpret shell metacharacters. The double-backslash replacement
 * target uses `String.raw` to avoid visual `\\\\` ambiguity; the
 * single-backslash search argument can't (template literals can't
 * end in `\`), so it stays as a plain escape.
 */
function quote(path: string): string {
  const escaped = path.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
  return `"${escaped}"`;
}
