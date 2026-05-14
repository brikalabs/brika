/**
 * Provider for the CLI's TUI state. Polls hub status every second so
 * the dashboard reacts to the hub starting/stopping during a session.
 * Plugin / workflow / log streams are wired in #9 — for now the lists
 * are seeded from props so the dashboard can render meaningfully even
 * before those endpoints exist.
 */

import type { Mood } from '@brika/brix';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { brikaHome } from '../cli/paths';
import { checkPid, type PidStatus } from '../cli/pid';
import {
  CliContext,
  type CliState,
  type HubStatus,
  type PluginSummary,
  type WorkflowSummary,
} from './useCli';

const POLL_INTERVAL_MS = 1000;

export interface CliProviderProps {
  readonly version: string;
  readonly children?: React.ReactNode;
}

function moodFor(hub: HubStatus): Mood {
  switch (hub.state) {
    case 'running':
      return 'idle';
    case 'stopped':
      return 'sleep';
    case 'stale':
      return 'suspicious';
    case 'unknown':
      return 'thinking';
  }
}

function pidToHub(pid: PidStatus): HubStatus {
  switch (pid.state) {
    case 'running':
      return { state: 'running', pid: pid.pid };
    case 'stale':
      return { state: 'stale', pid: pid.pid };
    case 'stopped':
      return { state: 'stopped' };
  }
}

export function CliProvider({ version, children }: Readonly<CliProviderProps>): React.ReactElement {
  const [hub, setHub] = useState<HubStatus>({ state: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const status = await checkPid();
      if (!cancelled) {
        setHub(pidToHub(status));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Plugin / workflow / log feeds are placeholders until the hub
  // exposes the matching HTTP endpoints (#9 in tasks.md). The state
  // shape is the real one — wiring it up is a separate, additive PR.
  const plugins: ReadonlyArray<PluginSummary> = [];
  const workflows: ReadonlyArray<WorkflowSummary> = [];
  const recentLogs: ReadonlyArray<string> = [];

  const value = useMemo<CliState>(
    () => ({
      workspace: brikaHome(),
      version,
      hub,
      plugins,
      workflows,
      recentLogs,
      mood: moodFor(hub),
    }),
    [hub, version, plugins, workflows, recentLogs]
  );

  return <CliContext.Provider value={value}>{children}</CliContext.Provider>;
}
