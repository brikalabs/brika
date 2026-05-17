/**
 * Boot-splash state machine. Picks a greeting emote + a fresh list of
 * fake steps once at mount, ticks through each step on its own
 * jittered timer, then holds in the `ready` state for `READY_HOLD_MS`
 * before firing `onComplete` so the operator can actually see the
 * final green ✓ flip in.
 *
 * Random picks live in `useMemo([])` so HMR / StrictMode re-mounts
 * don't reshuffle the boot mid-splash.
 */

import type { EmoteName } from '@brika/brix';
import { useEffect, useMemo, useState } from 'react';
import { pickGreeting } from './random';
import { type BootStep, pickSteps } from './StepList';

/** Steps shown per boot — enough for ~2.5–3 s of in-progress work
 *  without overstaying the welcome. */
const STEPS_PER_BOOT = 6;
/** Hold the all-green "ready" state before handing off to the shell. */
const READY_HOLD_MS = 700;

export type BootPhase = 'running' | 'ready';

export interface BootSequence {
  readonly steps: ReadonlyArray<BootStep>;
  readonly greeting: EmoteName;
  /** Number of steps fully resolved. Equal to `steps.length` once
   *  every step is done — that's the cue for `phase === 'ready'`. */
  readonly currentIdx: number;
  readonly phase: BootPhase;
}

export function useBootSequence(onComplete: () => void): BootSequence {
  const greeting = useMemo(() => pickGreeting(), []);
  const steps = useMemo(() => pickSteps(STEPS_PER_BOOT), []);
  const [currentIdx, setCurrentIdx] = useState(0);

  const allDone = currentIdx >= steps.length;
  const phase: BootPhase = allDone ? 'ready' : 'running';

  // Advance to the next step on its own jittered timer.
  useEffect(() => {
    if (allDone) {
      return;
    }
    const step = steps[currentIdx];
    if (!step) {
      return;
    }
    const t = setTimeout(() => setCurrentIdx((n) => n + 1), step.ms);
    return () => clearTimeout(t);
  }, [currentIdx, allDone, steps]);

  // Once every step is green, hold for a beat so the "ready" state
  // is actually visible before the shell takes over.
  useEffect(() => {
    if (!allDone) {
      return;
    }
    const t = setTimeout(onComplete, READY_HOLD_MS);
    return () => clearTimeout(t);
  }, [allDone, onComplete]);

  return { steps, greeting, currentIdx, phase };
}
