/**
 * Idle-line scheduler. Whenever Brix's speech reducer parks in `idle`
 * for longer than a randomised window, we dispatch a fresh line.
 *
 * Selection is biased so the stream stays varied:
 *
 *   - small chance (`RANDOM_THOUGHT_BIAS`) → a non-sequitur from
 *     `RANDOM_THOUGHTS` ("do bricks dream of mortar?")
 *   - small chance (`TIME_OF_DAY_BIAS`) → a time-aware quip
 *     ("morning shift, eh?" at 8am)
 *   - otherwise → hub-state pool plus common pool, evenly weighted
 *
 * The dispatched line drives both the bubble's typewriter and Brix's
 * mood (via inline `{:emote:}` tokens parsed by `brixHostReducer`).
 */

import type { Mood } from '@brika/brix';
import { type Dispatch, useEffect, useMemo } from 'react';
import type { HostEvent } from './brixHostReducer';
import { colorForMood } from './colors';
import {
  AUTO_TALK_MAX_MS,
  AUTO_TALK_MIN_MS,
  PACING,
  RANDOM_THOUGHT_BIAS,
  TIME_OF_DAY_BIAS,
} from './constants';
import {
  COMMON_IDLE_LINES,
  type HubState,
  IDLE_LINES_BY_STATE,
  RANDOM_THOUGHTS,
  TIME_OF_DAY_LINES,
} from './lines';
import { chance, pickFrom, randomInt } from './random';
import { timeOfDay } from './timeOfDay';

const FALLBACK_LINE = 'still here.';

function pickIdleLine(hubState: HubState): string {
  if (chance(RANDOM_THOUGHT_BIAS)) {
    return pickFrom(RANDOM_THOUGHTS, FALLBACK_LINE);
  }
  if (chance(TIME_OF_DAY_BIAS)) {
    return pickFrom(TIME_OF_DAY_LINES[timeOfDay()], FALLBACK_LINE);
  }
  const pool = [...IDLE_LINES_BY_STATE[hubState], ...COMMON_IDLE_LINES];
  return pickFrom(pool, FALLBACK_LINE);
}

export function useIdleChatter(
  phase: 'idle' | 'reacting' | 'speaking',
  hubState: HubState,
  mood: Mood,
  dispatch: Dispatch<HostEvent>,
  enabled = true
): void {
  // Stable function — `pickIdleLine` only depends on its argument, but
  // wrapping with useMemo keeps the effect deps array tidy.
  const speak = useMemo(
    () => () =>
      dispatch({
        type: 'IDLE_LINE',
        text: pickIdleLine(hubState),
        tint: colorForMood(mood),
        pacing: PACING,
      }),
    [hubState, mood, dispatch]
  );

  useEffect(() => {
    if (!enabled || phase !== 'idle') {
      return;
    }
    const delay = AUTO_TALK_MIN_MS + randomInt(AUTO_TALK_MAX_MS - AUTO_TALK_MIN_MS);
    const t = setTimeout(speak, delay);
    return () => clearTimeout(t);
  }, [phase, speak, enabled]);
}
