/**
 * `<BrixIdle />` — a living idle state. Combines a calm breathing
 * loop with rare blinks, side-glances, and the occasional one-shot
 * emote (wink, hop, sparkle). The picks are deterministic-ish — a
 * small LCG, seeded per-mount — so two Brixes on the same screen
 * don't blink in unison and a single Brix doesn't loop a tic.
 *
 *   <BrixIdle />                          // calm, lively idle
 *   <BrixIdle mood="curious" />           // breathes with curious eyes
 *   <BrixIdle emoteChance={0.12} />       // turn up the chaos
 *
 * Use this anywhere Brix is "there but not doing anything" — the
 * dashboard hub card, the corner of a long-running view, an empty
 * state. It cleans up its timer on unmount.
 */

import { Text } from 'ink';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ANIMATIONS, type AnimationKind } from './animations';
import { type Bracket, faceOf, type Mood } from './moods';

export interface BrixIdleProps {
  /** Base mood while breathing. Default `idle`. */
  readonly mood?: Mood;
  readonly bracket?: Bracket;
  readonly color?: string;
  /** Probability per breath tick of triggering a one-shot emote. Default 0.08. */
  readonly emoteChance?: number;
  /** Override the breathing tick (ms). */
  readonly breathMs?: number;
  /** Set to false to skip the rare emote bursts and just breathe. */
  readonly emotes?: boolean;
}

/** One-shot animations the idle loop can sprinkle in between breaths. */
const EMOTE_KINDS: ReadonlyArray<AnimationKind> = [
  'blink',
  'glance',
  'wink',
  'hop',
  'nom',
];

/**
 * Small LCG. Math.random would do, but a seeded generator means two
 * Brixes mounted at the same tick still desynchronize naturally (the
 * seed varies on Date.now + a mount-time salt) and tests can swap it
 * out without monkey-patching globals.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x100000000;
  };
}

interface EmoteRun {
  readonly kind: AnimationKind;
  readonly frame: number;
}

export function BrixIdle({
  mood = 'idle',
  bracket = 'round',
  color,
  emoteChance = 0.08,
  breathMs,
  emotes = true,
}: Readonly<BrixIdleProps>): React.ReactElement {
  const breath = ANIMATIONS.breathing;
  const interval = breathMs ?? breath.intervalMs;

  const rng = useRef<() => number>(makeRng(Date.now() ^ Math.floor(Math.random() * 0xffff)));
  const [breathFrame, setBreathFrame] = useState(0);
  const [emote, setEmote] = useState<EmoteRun | null>(null);

  // Breath tick — also rolls the dice for triggering an emote.
  useEffect(() => {
    if (emote) {
      return;
    }
    const t = setInterval(() => {
      setBreathFrame((f) => (f + 1) % breath.frames.length);
      if (emotes && rng.current() < emoteChance) {
        const pick = EMOTE_KINDS[Math.floor(rng.current() * EMOTE_KINDS.length)];
        if (pick) {
          setEmote({ kind: pick, frame: 0 });
        }
      }
    }, interval);
    return () => clearInterval(t);
  }, [emote, interval, breath.frames.length, emotes, emoteChance]);

  // Emote tick — walks the chosen animation once, then hands control
  // back to the breathing loop.
  useEffect(() => {
    if (!emote) {
      return;
    }
    const anim = ANIMATIONS[emote.kind];
    if (emote.frame >= anim.frames.length) {
      setEmote(null);
      return;
    }
    const t = setTimeout(() => {
      setEmote({ kind: emote.kind, frame: emote.frame + 1 });
    }, anim.intervalMs);
    return () => clearTimeout(t);
  }, [emote]);

  const glyph = emote
    ? (ANIMATIONS[emote.kind].frames[emote.frame] ??
      ANIMATIONS[emote.kind].frames[ANIMATIONS[emote.kind].frames.length - 1] ??
      faceOf(mood, bracket))
    : (breath.frames[breathFrame] ?? faceOf(mood, bracket));

  return <Text color={color}>{glyph}</Text>;
}
