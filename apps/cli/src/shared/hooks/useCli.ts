/**
 * Domain state for the brika TUI. Holds hub status, the lists every
 * section reads from, Brix's current mood + status line, and the
 * action callbacks (start/stop/restart/open) that the sidebar's
 * hotkeys dispatch to.
 *
 * Generic shell concerns — chrome height, app-level onQuit — live in
 * `useTuiShell()` from `@brika/tui`. Don't duplicate them here.
 */

import type { EmoteName, Mood } from '@brika/brix';
import { createContext, useContext } from 'react';

export type HubStatus =
  /**
   * `pid` is `null` when the hub is up but we don't own its PID file
   * (an externally-started `bun --watch` hub, a docker container, etc.).
   * The TUI still shows it as "running" — the UI just omits the pid badge.
   */
  | { state: 'running'; pid: number | null; sinceMs?: number }
  | { state: 'stale'; pid: number }
  | { state: 'stopped' }
  | { state: 'unknown' };

export interface CliActions {
  /** Spawn `brika hub` as a detached child. No-op if already running. */
  readonly startHub: () => Promise<void>;
  /** Send SIGTERM to the supervisor. No-op if not running. */
  readonly stopHub: () => Promise<void>;
  /** Send SIGUSR1. No-op if not running. */
  readonly restartHub: () => Promise<void>;
  /** Open the hub URL in the default browser. No-op if not running. */
  readonly openUi: () => Promise<void>;
}

export interface CliState extends CliActions {
  readonly workspace: string;
  readonly version: string;
  readonly hub: HubStatus;
  /** Mood the mascot displays in the header + footer right now. */
  readonly mood: Mood;
  /** One-line caption the footer's BrixStatusline reads. */
  readonly statusText: string;
  /**
   * Emote to play in the running-hub activity rotation. `null` when
   * no rotation is active (hub stopped, mid-greeting, transient mood).
   * Changes every ~10–18s to give Brix variety while idle.
   */
  readonly activityEmote: EmoteName | null;
}

export const CliContext = createContext<CliState | null>(null);

export function useCli(): CliState {
  const ctx = useContext(CliContext);
  if (!ctx) {
    throw new Error('useCli() called outside <CliProvider>');
  }
  return ctx;
}
