/**
 * Domain state for the Brika CLI's TUI surface. Tracks hub status,
 * plugin/workflow counts, and a Brix mood that views can read to
 * keep the mascot in sync with what's happening.
 *
 * Generic shell concerns (chrome height, onQuit) live in
 * `useTuiShell()` from `@brika/tui` — keep them out of here.
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

export interface CliState {
  readonly workspace: string;
  readonly version: string;
  readonly hub: HubStatus;
  readonly plugins: ReadonlyArray<PluginSummary>;
  readonly workflows: ReadonlyArray<WorkflowSummary>;
  /** Most recent log lines for the dashboard preview. */
  readonly recentLogs: ReadonlyArray<string>;
  /** Mood the mascot should display right now. */
  readonly mood: Mood;
}

export const CliContext = createContext<CliState | null>(null);

export function useCli(): CliState {
  const ctx = useContext(CliContext);
  if (!ctx) {
    throw new Error('useCli() called outside <CliProvider>');
  }
  return ctx;
}
