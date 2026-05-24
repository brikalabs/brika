/**
 * L3 OS-sandbox entry point.
 *
 * Picks the right launcher for the host platform and the operator's
 * configured mode. `BRIKA_SANDBOX_MODE`:
 *   - `enforce`    (default on supported OSs): wrap every plugin spawn
 *   - `permissive` : log what would be enforced but use the noop launcher
 *   - `off`        : noop launcher unconditionally
 *
 * Adding a new platform: implement a `SandboxLauncher` in a sibling
 * file and add a case to `pickLauncher` below.
 */

import { macosLauncher } from './macos-launcher';
import { noopLauncher } from './noop-launcher';
import type { SandboxLauncher, SandboxMode } from './types';

export { macosLauncher } from './macos-launcher';
export { buildMacosProfile } from './macos-profile';
export { noopLauncher } from './noop-launcher';
export type { SandboxLauncher, SandboxLaunchPlan, SandboxMode, SandboxProfile } from './types';

export function pickLauncher(mode: SandboxMode = 'enforce'): SandboxLauncher {
  if (mode === 'off' || mode === 'permissive') {
    return noopLauncher;
  }
  if (process.platform === 'darwin') {
    return macosLauncher;
  }
  // Linux: landlock + seccomp will land here. Windows: AppContainer.
  // Until then, fall back to noop with the JS layer doing the work.
  return noopLauncher;
}

/**
 * Read the mode from env. Defaults to `enforce` so production picks
 * up the strictest available stance without explicit config.
 */
export function readSandboxModeFromEnv(env: NodeJS.ProcessEnv = process.env): SandboxMode {
  const raw = env.BRIKA_SANDBOX_MODE;
  if (raw === 'off' || raw === 'permissive') {
    return raw;
  }
  return 'enforce';
}
