/**
 * Provider for the brika TUI's domain state. Owns the hub-status
 * poll loop and exposes the four hub-control actions
 * (start/stop/restart/open) the rest of the TUI dispatches to.
 *
 * Per-resource lists (plugins / workflows / users / logs) are fetched
 * by each view via `useHubResource`, not centralised here — the
 * provider only owns global state every view needs.
 */

import type { EmoteName, Mood } from '@brika/brix';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { hubUrl } from './shared/cli/hub-client';
import { spawnHubDetached } from './shared/cli/hub-spawn-detached';
import { openBrowser } from './shared/cli/open';
import { brikaHome } from './shared/cli/paths';
import { checkPid, type PidStatus, removePidFile } from './shared/cli/pid';
import { CliContext, type CliState, type HubStatus } from './shared/hooks/useCli';

const POLL_INTERVAL_MS = 1000;
/** Wait this long after the hub greeting before rotation kicks in,
 *  so the "hi!" wave gets a moment on stage. */
const ACTIVITY_INITIAL_DELAY_MS = 4_000;
const ACTIVITY_MIN_MS = 10_000;
const ACTIVITY_MAX_MS = 18_000;

export interface CliProviderProps {
  readonly version: string;
  readonly children?: React.ReactNode;
  /** Hub-status poll cadence. Default 1000ms; tests pass ~10ms. */
  readonly pollIntervalMs?: number;
  /** How long a transient caption stays before drifting back to default.
   *  Default 2500ms; tests pass ~100ms. */
  readonly transientMoodMs?: number;
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

interface Activity extends MoodLine {
  readonly emote: EmoteName;
}

/** Activities Brix cycles through while the hub is up. Each pairs a
 *  short "-ing" status caption with a fitting mood and an existing
 *  emote animation. Order doesn't matter — the rotation picks at
 *  random, avoiding the previous entry. */
const RUNNING_ACTIVITIES: ReadonlyArray<Activity> = [
  // Quiet / in-place beats.
  { mood: 'idle', statusText: 'watching', emote: 'idle' },
  { mood: 'thinking', statusText: 'pondering', emote: 'think' },
  { mood: 'cheeky', statusText: 'snacking', emote: 'nom' },
  { mood: 'happy', statusText: 'humming', emote: 'dance' },
  { mood: 'tired', statusText: 'stretching', emote: 'yawn' },
  { mood: 'cool', statusText: 'vibing', emote: 'cool' },
  { mood: 'shy', statusText: 'pooping', emote: 'poop' },
  { mood: 'wink', statusText: 'people-watching', emote: 'wink' },
  { mood: 'focused', statusText: 'debugging', emote: 'think' },
  { mood: 'proud', statusText: 'nodding along', emote: 'nod' },
  { mood: 'starry', statusText: 'daydreaming', emote: 'love' },

  // Movement beats — body actually goes places.
  { mood: 'focused', statusText: 'patrolling', emote: 'patrol' },
  { mood: 'curious', statusText: 'wandering', emote: 'wandering' },
  { mood: 'curious', statusText: 'peeking around', emote: 'peek' },
  { mood: 'excited', statusText: 'running errands', emote: 'dash' },
  { mood: 'panic', statusText: 'fleeing a bug', emote: 'flee' },
  { mood: 'cheeky', statusText: 'looping the block', emote: 'wraparound' },
  { mood: 'cheeky', statusText: 'boogying', emote: 'boogie' },
  { mood: 'starry', statusText: 'showing off', emote: 'somersault' },
  { mood: 'cheeky', statusText: 'goofing off', emote: 'hop' },
];

function pickActivity(prev: number): number {
  if (RUNNING_ACTIVITIES.length <= 1) {
    return 0;
  }
  let next = randomInt(RUNNING_ACTIVITIES.length);
  if (next === prev) {
    next = (next + 1) % RUNNING_ACTIVITIES.length;
  }
  return next;
}

function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
}

function randomGapMs(): number {
  return ACTIVITY_MIN_MS + randomInt(ACTIVITY_MAX_MS - ACTIVITY_MIN_MS);
}

function defaultMoodFor(hub: HubStatus, activity: Activity | null): MoodLine {
  switch (hub.state) {
    case 'running':
      return activity ?? { mood: 'idle', statusText: 'watching' };
    case 'stopped':
      return { mood: 'sleep', statusText: "hub is sleeping — press 'ctrl+s' to start" };
    case 'stale':
      return { mood: 'suspicious', statusText: 'stale pid — start to recover' };
    case 'unknown':
      return { mood: 'thinking', statusText: 'checking hub…' };
  }
}

export function CliProvider({
  version,
  children,
  pollIntervalMs = POLL_INTERVAL_MS,
  transientMoodMs = 2500,
}: Readonly<CliProviderProps>): React.ReactElement {
  const [hub, setHub] = useState<HubStatus>({ state: 'unknown' });
  const [transient, setTransient] = useState<MoodLine | null>(null);
  const [activityIndex, setActivityIndex] = useState<number | null>(null);

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
    const t = setInterval(() => void tick(), pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollIntervalMs]);

  // Transient mood lines (e.g. "starting…") auto-clear after a beat
  // so the footer drifts back to the default for the hub state.
  useEffect(() => {
    if (transient === null) {
      return;
    }
    const t = setTimeout(() => setTransient(null), transientMoodMs);
    return () => clearTimeout(t);
  }, [transient, transientMoodMs]);

  // Activity rotation: while the hub is running, swap Brix's "-ing"
  // status every 10–18s. The first swap waits ACTIVITY_INITIAL_DELAY_MS
  // so the "hi!" greeting wave plays out first.
  useEffect(() => {
    if (hub.state !== 'running') {
      setActivityIndex(null);
      return;
    }
    const state = { cancelled: false, timer: null as ReturnType<typeof setTimeout> | null };
    const tick = (): void => {
      if (state.cancelled) {
        return;
      }
      setActivityIndex((prev) => pickActivity(prev ?? 0));
      state.timer = setTimeout(tick, randomGapMs());
    };
    state.timer = setTimeout(tick, ACTIVITY_INITIAL_DELAY_MS);
    return () => {
      state.cancelled = true;
      if (state.timer) {
        clearTimeout(state.timer);
      }
    };
  }, [hub.state]);

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

  /** Send `signal` to the running hub. The mood/statusText feedback
   *  is shared between Stop (`SIGTERM`) and Restart (`SIGUSR1`); only
   *  the success caption + the "no-op" branch differ, so they live in
   *  the params instead of being duplicated across the two callbacks. */
  const signalHub = useCallback(
    async (
      signal: NodeJS.Signals,
      successCaption: (pid: number) => MoodLine,
      idleCaption: MoodLine,
      verb: string,
      noPidCaption: MoodLine
    ): Promise<void> => {
      const status = await checkPid();
      if (status.state !== 'running') {
        if (signal === 'SIGTERM' && status.state === 'stale') {
          await removePidFile();
          setTransient({ mood: 'suspicious', statusText: 'stale pid — cleared' });
          return;
        }
        setTransient(idleCaption);
        return;
      }
      if (status.pid === null) {
        setTransient(noPidCaption);
        return;
      }
      try {
        process.kill(status.pid, signal);
        setTransient(successCaption(status.pid));
      } catch (e) {
        setTransient({
          mood: 'error',
          statusText: `couldn't ${verb}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },
    []
  );

  const stopHub = useCallback(
    () =>
      signalHub(
        'SIGTERM',
        (pid) => ({ mood: 'focused', statusText: `sent SIGTERM to pid ${pid}` }),
        { mood: 'sleep', statusText: 'not running' },
        'stop',
        {
          mood: 'suspicious',
          statusText: "can't stop — hub was started outside the TUI (no pid file)",
        }
      ),
    [signalHub]
  );

  const restartHub = useCallback(
    () =>
      signalHub(
        'SIGUSR1',
        (pid) => ({ mood: 'thinking', statusText: `restart signal → pid ${pid}` }),
        { mood: 'sleep', statusText: 'nothing to restart' },
        'restart',
        { mood: 'suspicious', statusText: "can't restart — hub was started outside the TUI" }
      ),
    [signalHub]
  );

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

  const activity =
    hub.state === 'running' && activityIndex !== null
      ? (RUNNING_ACTIVITIES[activityIndex] ?? null)
      : null;
  const moodLine = transient ?? defaultMoodFor(hub, activity);
  // Activity emote only drives the stage when no transient mood is
  // hijacking the bubble — otherwise the transient should keep priority.
  const activityEmote = transient === null && activity ? activity.emote : null;

  const value = useMemo<CliState>(
    () => ({
      workspace: brikaHome(),
      version,
      hub,
      mood: moodLine.mood,
      statusText: moodLine.statusText,
      activityEmote,
      startHub,
      stopHub,
      restartHub,
      openUi,
    }),
    [
      version,
      hub,
      moodLine.mood,
      moodLine.statusText,
      activityEmote,
      startHub,
      stopHub,
      restartHub,
      openUi,
    ]
  );

  return <CliContext.Provider value={value}>{children}</CliContext.Provider>;
}
