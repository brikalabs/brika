/**
 * Provider for the brika TUI's domain state. Owns the hub-status
 * poll loop and exposes the four hub-control actions
 * (start/stop/restart/open) the rest of the TUI dispatches to.
 *
 * Plugin / workflow / user / log lists are stubbed for now — they'll
 * land once the hub exposes the matching HTTP endpoints (#9 in
 * docs/cli-tui/tasks.md).
 */

import type { Mood } from '@brika/brix';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { hubUrl } from '../cli/hub-client';
import { spawnHubDetached } from '../cli/hub-spawn-detached';
import { openBrowser } from '../cli/open';
import { brikaHome } from '../cli/paths';
import { checkPid, type PidStatus, removePidFile } from '../cli/pid';
import {
  CliContext,
  type CliState,
  type HubStatus,
  type PluginSummary,
  type UserSummary,
  type WorkflowSummary,
} from './useCli';

const POLL_INTERVAL_MS = 1000;

export interface CliProviderProps {
  readonly version: string;
  readonly children?: React.ReactNode;
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

interface MoodLine {
  readonly mood: Mood;
  readonly statusText: string;
}

function defaultMoodFor(hub: HubStatus): MoodLine {
  switch (hub.state) {
    case 'running':
      return { mood: 'idle', statusText: 'watching' };
    case 'stopped':
      return { mood: 'sleep', statusText: "hub is sleeping — press 'ctrl+s' to start" };
    case 'stale':
      return { mood: 'suspicious', statusText: 'stale pid — start to recover' };
    case 'unknown':
      return { mood: 'thinking', statusText: 'checking hub…' };
  }
}

export function CliProvider({ version, children }: Readonly<CliProviderProps>): React.ReactElement {
  const [hub, setHub] = useState<HubStatus>({ state: 'unknown' });
  const [transient, setTransient] = useState<MoodLine | null>(null);

  // Hub PID polling.
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

  // Transient mood lines (e.g. "starting…") auto-clear after a beat
  // so the footer drifts back to the default for the hub state.
  useEffect(() => {
    if (transient === null) {
      return;
    }
    const t = setTimeout(() => setTransient(null), 2500);
    return () => clearTimeout(t);
  }, [transient]);

  const startHub = useCallback(async (): Promise<void> => {
    const status = await checkPid();
    if (status.state === 'running') {
      setTransient({ mood: 'suspicious', statusText: 'already running' });
      return;
    }
    if (status.state === 'stale') {
      await removePidFile();
    }
    setTransient({ mood: 'loading', statusText: 'spawning hub…' });
    try {
      const pid = await spawnHubDetached();
      setTransient({
        mood: 'happy',
        statusText: pid === null ? 'hub is up' : `spawned hub (pid ${pid})`,
      });
    } catch (e) {
      setTransient({
        mood: 'error',
        statusText: `couldn't spawn: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }, []);

  const stopHub = useCallback(async (): Promise<void> => {
    const status = await checkPid();
    if (status.state === 'stopped') {
      setTransient({ mood: 'sleep', statusText: 'not running' });
      return;
    }
    if (status.state === 'stale') {
      await removePidFile();
      setTransient({ mood: 'suspicious', statusText: 'stale pid — cleared' });
      return;
    }
    if (status.pid === null) {
      setTransient({
        mood: 'suspicious',
        statusText: "can't stop — hub was started outside the TUI (no pid file)",
      });
      return;
    }
    try {
      process.kill(status.pid, 'SIGTERM');
      setTransient({ mood: 'focused', statusText: `sent SIGTERM to pid ${status.pid}` });
    } catch (e) {
      setTransient({
        mood: 'error',
        statusText: `couldn't stop: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }, []);

  const restartHub = useCallback(async (): Promise<void> => {
    const status = await checkPid();
    if (status.state !== 'running') {
      setTransient({ mood: 'sleep', statusText: 'nothing to restart' });
      return;
    }
    if (status.pid === null) {
      setTransient({
        mood: 'suspicious',
        statusText: "can't restart — hub was started outside the TUI",
      });
      return;
    }
    try {
      process.kill(status.pid, 'SIGUSR1');
      setTransient({ mood: 'thinking', statusText: `restart signal → pid ${status.pid}` });
    } catch (e) {
      setTransient({
        mood: 'error',
        statusText: `couldn't restart: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }, []);

  const openUi = useCallback(async (): Promise<void> => {
    const status = await checkPid();
    if (status.state !== 'running') {
      setTransient({ mood: 'sleep', statusText: "hub isn't running — start it first" });
      return;
    }
    const url = hubUrl();
    openBrowser(url);
    setTransient({ mood: 'excited', statusText: `opening ${url}` });
  }, []);

  // Placeholder lists — wired up once the hub exposes HTTP endpoints.
  const plugins: ReadonlyArray<PluginSummary> = [];
  const workflows: ReadonlyArray<WorkflowSummary> = [];
  const users: ReadonlyArray<UserSummary> = [];
  const recentLogs: ReadonlyArray<string> = [];

  const moodLine = transient ?? defaultMoodFor(hub);

  const value = useMemo<CliState>(
    () => ({
      workspace: brikaHome(),
      version,
      hub,
      plugins,
      workflows,
      users,
      recentLogs,
      mood: moodLine.mood,
      statusText: moodLine.statusText,
      startHub,
      stopHub,
      restartHub,
      openUi,
    }),
    [
      version,
      hub,
      plugins,
      workflows,
      users,
      recentLogs,
      moodLine.mood,
      moodLine.statusText,
      startHub,
      stopHub,
      restartHub,
      openUi,
    ]
  );

  return <CliContext.Provider value={value}>{children}</CliContext.Provider>;
}
