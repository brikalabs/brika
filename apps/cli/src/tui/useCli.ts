/**
 * Domain state for the brika TUI. Holds hub status, the lists every
 * section reads from, Brix's current mood + status line, and the
 * action callbacks (start/stop/restart/open) that the sidebar's
 * hotkeys dispatch to.
 *
 * Generic shell concerns — chrome height, app-level onQuit — live in
 * `useTuiShell()` from `@brika/tui`. Don't duplicate them here.
 */

import type { Mood } from '@brika/brix';
import { createContext, useContext } from 'react';

export type HubStatus =
  | { state: 'running'; pid: number; sinceMs?: number }
  | { state: 'stale'; pid: number }
  | { state: 'stopped' }
  | { state: 'unknown' };

export interface PluginSummary {
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
}

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly state: 'idle' | 'running' | 'failed';
}

export interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

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
  readonly plugins: ReadonlyArray<PluginSummary>;
  readonly workflows: ReadonlyArray<WorkflowSummary>;
  readonly users: ReadonlyArray<UserSummary>;
  readonly recentLogs: ReadonlyArray<string>;
  /** Mood the mascot displays in the header + footer right now. */
  readonly mood: Mood;
  /** One-line caption the footer's BrixStatusline reads. */
  readonly statusText: string;
}

export const CliContext = createContext<CliState | null>(null);

export function useCli(): CliState {
  const ctx = useContext(CliContext);
  if (!ctx) {
    throw new Error('useCli() called outside <CliProvider>');
  }
  return ctx;
}
