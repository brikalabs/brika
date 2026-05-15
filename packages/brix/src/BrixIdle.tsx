/**
 * `<BrixIdle />` — a living idle state. Brix sits on the program's
 * baseline animation (default `breathing`) and occasionally drops a
 * one-shot emote from the weighted pool — a blink, a glance, a wink,
 * a tiny hop. The picks come from a seeded LCG (`makeRng`) so two
 * Brixes on the same screen never sync up and tests can be made
 * deterministic.
 *
 *   <BrixIdle />                                  // default program
 *   <BrixIdle program={{ baseline: 'breathing',  // custom emote pool
 *     emotes: [{ kind: 'wink', weight: 1 }],
 *     emoteChance: 0.05 }} />
 *   <BrixIdle program={{ ...DEFAULT_IDLE_PROGRAM, emoteChance: 0 }} />  // just breathing
 *
 * The component is composed of two states:
 *   1. baseline — `useFrameSeq` walks the breathing loop. On every
 *      tick the LCG rolls for an emote.
 *   2. emote — a child `<EmoteOverlay>` mounts, plays the one-shot,
 *      and unmounts back to baseline. Keeps the React tree clean and
 *      avoids running two `useFrameSeq` instances in parallel.
 */

import { Text } from 'ink';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ANIMATIONS, type AnimationKind } from './animations';
import { DEFAULT_IDLE_PROGRAM, type IdleProgram, makeRng, pickIdleEmote } from './idle';
import { type Bracket, type Mood } from './moods';
import { useFrameSeq } from './useFrameSeq';

export interface BrixIdleProps {
  readonly mood?: Mood;
  readonly bracket?: Bracket;
  readonly color?: string;
  /** Override the idle program (baseline + emote weights + chance). */
  readonly program?: IdleProgram;
  /** Seed the picker — useful for tests. Default: `Date.now() ^ random`. */
  readonly seed?: number;
}

export function BrixIdle({
  color,
  program = DEFAULT_IDLE_PROGRAM,
  seed,
}: Readonly<BrixIdleProps>): React.ReactElement {
  const baseline = ANIMATIONS[program.baseline];
  const { frame, index } = useFrameSeq(baseline, { loop: true });

  const rng = useRef<() => number>(makeRng(seed ?? Date.now() ^ randomSalt()));
  const [emote, setEmote] = useState<AnimationKind | null>(null);

  // Roll the dice on every baseline tick. We only consider a roll
  // when no emote is currently playing — emotes never stack.
  useEffect(() => {
    if (emote) {
      return;
    }
    if (rng.current() < program.emoteChance) {
      const picked = pickIdleEmote(program.emotes, rng.current);
      if (picked) {
        setEmote(picked);
      }
    }
  }, [index, emote, program.emoteChance, program.emotes]);

  if (emote) {
    return <EmoteOverlay kind={emote} color={color} onEnd={() => setEmote(null)} />;
  }
  return <Text color={color}>{frame}</Text>;
}

interface EmoteOverlayProps {
  readonly kind: AnimationKind;
  readonly color?: string;
  readonly onEnd: () => void;
}

/**
 * Mounts for the duration of a single one-shot emote. Owns its own
 * `useFrameSeq` so frame state resets cleanly whenever a new emote
 * starts — and tears down on unmount.
 */
function EmoteOverlay({ kind, color, onEnd }: Readonly<EmoteOverlayProps>): React.ReactElement {
  const { frame } = useFrameSeq(ANIMATIONS[kind], { loop: false, onEnd });
  return <Text color={color}>{frame}</Text>;
}

/** 16-bit cryptographically-strong salt for desynchronising mascots. */
function randomSalt(): number {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}
