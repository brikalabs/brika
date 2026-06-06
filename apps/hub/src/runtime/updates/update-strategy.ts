/**
 * CLI-facing seam for picking the update strategy.
 *
 * The hub's `UpdateOrchestrator` selects a strategy at boot and gates
 * every apply through it; refusing runtimes (container, system-package,
 * dev) reject with actionable guidance instead of swapping a binary
 * they don't own. The in-process `brika update` path runs outside the
 * orchestrator, so it resolves the same strategy here to inherit those
 * refusals rather than blindly overwriting `process.execPath`.
 *
 * `detectRuntimeMode()` is a pure function of env + execPath + compiled
 * flag, so it resolves identically in the CLI process and the hub.
 */

import { detectRuntimeMode } from './runtime-mode';
import { strategyForMode, type UpdateStrategy } from './strategies';

export type { UpdateChannelId } from './channels';
export { UpdateRefusedError, type UpdateStrategy } from './strategies';

/** The update strategy for the current runtime mode. */
export function resolveUpdateStrategy(): UpdateStrategy {
  return strategyForMode(detectRuntimeMode());
}
