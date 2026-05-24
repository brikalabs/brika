/**
 * Pass-through launcher for platforms without a built-in sandbox
 * (Windows, Linux pending landlock+seccomp implementation).
 *
 * Layer 1 (JS lockdown) + Layer 2 (grant vector) are still active.
 * L3 isn't, so we log a one-time warning on the first spawn so
 * operators know their plugin is running with reduced kernel-level
 * defence.
 */

import type { SandboxLauncher, SandboxLaunchPlan, SandboxProfile } from './types';

export const noopLauncher: SandboxLauncher = {
  name: 'noop',
  wrap(cmd: string, args: ReadonlyArray<string>, _profile: SandboxProfile): SandboxLaunchPlan {
    return { cmd, args };
  },
};
