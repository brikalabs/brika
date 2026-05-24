/**
 * macOS `SandboxLauncher` — wraps the plugin spawn with `sandbox-exec`
 * configured by the scope-derived SBPL profile.
 *
 * Command shape: `sandbox-exec -p '<sbpl>' <bunBin> --preload=<prelude> <bundle>`
 *
 * The original command + args are appended after the SBPL profile,
 * so the kernel applies the profile to the spawned process and every
 * descendant.
 */

import { buildMacosProfile } from './macos-profile';
import type { SandboxLauncher, SandboxLaunchPlan, SandboxProfile } from './types';

const SANDBOX_EXEC_BIN = '/usr/bin/sandbox-exec';

export const macosLauncher: SandboxLauncher = {
  name: 'macos-sandbox-exec',
  wrap(cmd: string, args: ReadonlyArray<string>, profile: SandboxProfile): SandboxLaunchPlan {
    const sbpl = buildMacosProfile(profile);
    return {
      cmd: SANDBOX_EXEC_BIN,
      args: ['-p', sbpl, cmd, ...args],
    };
  },
};
