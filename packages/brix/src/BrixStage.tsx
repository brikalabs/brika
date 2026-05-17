/**
 * `<BrixStage>` — the multi-line Brix canvas. Composes:
 *
 *   1. the current emote's `Timeline` (driven by `useTimeline`)
 *   2. a particle layer (`useParticles` with the emote's emitter)
 *   3. an optional speech bubble above the canvas, with a down-
 *      pointing tail that lines up with Brix's resting column
 *
 *           ╭──────────────────╮
 *           │  hi!             │
 *           ╰─────┬────────────╯
 *                 ▼
 *               ╭───╮
 *               │^◡^│
 *               ╰───╯
 *
 * When the provider has no active emote the stage falls back to the
 * `idle` emote. When an emote's timeline ends, the stage holds the
 * last frame for `emote.hold` ms, then signals `api.next()` to
 * advance — queued emotes then flow naturally.
 *
 * `BUBBLE_TAIL_BODY_COL` is the column on the canvas where Brix
 * naturally rests; the bubble's tail joint lines up with that column
 * so the bubble visually "speaks" from Brix's head.
 */

import { Box } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBrixImpulse } from './BrixPhysicsProvider';
import { Bubble } from './Bubble';
import { useEmote } from './EmoteProvider';
import { EMOTE_IDLE, type EmoteDef } from './emotes';
import { type Origin } from './particleEmitters';
import { SpriteView } from './SpriteView';
import { compose, type Sprite } from './sprite';
import {
  floorSprite,
  STAGE_FLOOR_LINE_Y,
  STAGE_FLOOR_Y,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './stageSprites';
import { clipFrameIndexAt } from './timeline';
import { useParticles } from './useParticles';
import { useTimeline } from './useTimeline';

export interface BrixStageProps {
  readonly width?: number;
  readonly height?: number;
  /** Render the speech bubble above the stage. Default true. */
  readonly bubble?: boolean;
  /** Bubble width; defaults to the stage width so the tail aligns. */
  readonly bubbleWidth?: number;
  /** Override the idle emote. */
  readonly idle?: EmoteDef;
  /** Animation FPS for the timeline + particle simulation. Default 30. */
  readonly fps?: number;
  /**
   * Render the dim horizontal floor line under Brix. Default `true`.
   * Pass `false` for a floating mascot (chat overlays, headers).
   * Pass a custom `Sprite` to swap in your own ground decoration
   * (grass, brick texture, …) — must fit the stage width.
   */
  readonly floor?: boolean | Sprite;
  /**
   * When `true`, an animated open-mouth glyph is composited over the
   * current emote's face — Brix appears to be speaking while the body
   * animation continues uninterrupted. Toggle this in sync with bubble
   * text reveal to get a talking-mouth effect.
   */
  readonly speaking?: boolean;
}

/** Cadence at which the mouth opens and closes while `speaking`. Slow
 *  enough to read as "moving lips" rather than a strobe; fast enough
 *  to suggest active speech (~3.3 Hz). */
const SPEAK_TOGGLE_MS = 150;
/** Glyph painted over the centre of the face while the mouth is open. */
const OPEN_MOUTH_CH = 'o';

const MOOD_TOKEN = /\{:[a-z]+:\}/g;

/** Column of Brix's body center on a default canvas — the bubble's
 *  bottom-tail joint anchors here. The default body spans cols 5..9,
 *  so the center cell is col 7. */
const BUBBLE_TAIL_BODY_COL = 7;

function stripMoodScript(input: string): string {
  return input.replace(MOOD_TOKEN, '').replace(/\s+/g, ' ').trim();
}

export function BrixStage({
  width = STAGE_WIDTH,
  height = STAGE_HEIGHT,
  bubble = true,
  bubbleWidth,
  idle = EMOTE_IDLE,
  fps = 30,
  floor = true,
  speaking = false,
}: Readonly<BrixStageProps>): React.ReactElement {
  const api = useEmote();
  const isPlaying = api.current !== null;
  const active = api.current ?? idle;

  // ── Hold-and-advance: timeline.onEnd → wait `hold` ms → api.next() ──
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, [active]);

  const { sprite: bodySprite, t } = useTimeline(active.timeline, {
    fps,
    onEnd: () => {
      if (!isPlaying) {
        return;
      }
      const hold = active.hold ?? 0;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
      }
      if (hold > 0) {
        holdTimer.current = setTimeout(() => api.next(), hold);
      } else {
        api.next();
      }
    },
  });

  // ── Speaking-mouth overlay ──────────────────────────────────────────
  // While `speaking`, an open-mouth glyph blinks on and off at a fixed
  // cadence. The body keeps running its own animation underneath — we
  // just paint a single cell over the face's mouth column.
  const [mouthOpen, setMouthOpen] = useState(false);
  useEffect(() => {
    if (!speaking) {
      setMouthOpen(false);
      return;
    }
    const id = setInterval(() => setMouthOpen((m) => !m), SPEAK_TOGGLE_MS);
    return () => clearInterval(id);
  }, [speaking]);

  const speakingOverlay = useMemo(() => {
    if (!speaking || !mouthOpen) {
      return null;
    }
    const animClip = active.timeline.tracks[0]?.clip;
    if (!animClip || active.states.length === 0) {
      return null;
    }
    const idx = clipFrameIndexAt(animClip, t);
    const state = idx >= 0 ? active.states[idx] : undefined;
    if (!state) {
      return null;
    }
    // Mirror renderBrick's face placement so the overlay lines up with
    // the baked face exactly.
    const w = Math.max(3, Math.round(state.w));
    const h = Math.max(2, Math.round(state.h));
    const feetRow = STAGE_FLOOR_Y - Math.round(state.y);
    const topRow = feetRow - h + 1;
    const half = Math.floor(w / 2);
    const left = Math.round(state.cx) - half;
    const faceY = h <= 2 ? topRow : topRow + 1;
    const faceX = left + Math.floor((w - state.face.width) / 2);
    const mouthX = faceX + Math.floor(state.face.width / 2);
    const sprite: Sprite = {
      rows: [[{ ch: OPEN_MOUTH_CH }]],
      width: 1,
      height: 1,
    };
    return { sprite, x: mouthX, y: faceY };
  }, [speaking, mouthOpen, active, t]);

  // ── Particle layer ──────────────────────────────────────────────────
  const origin: Origin = useMemo(() => ({ x: 0, y: 0, w: width, h: height }), [width, height]);
  const emitter = useMemo(
    () => (active.particles ? active.particles(origin) : null),
    [active, origin]
  );
  const particleSprite = useParticles(emitter, { width, height, fps });

  const tint = active.color ?? 'cyan';
  // Vertical anchor — pre-baked emote frames are STAGE_HEIGHT tall.
  // When the caller asks for a taller canvas (jump headroom), we want
  // those extra rows to become "sky" above the body, not empty space
  // beneath it. Shift every floor-relative layer down by the excess
  // height so the floor still rests on the bottom row.
  const skyRows = Math.max(0, height - STAGE_HEIGHT);

  // Floor layer — optional decoration the user can swap or remove
  // entirely. Composed at the bottom so the body and particles paint
  // over it.
  const floorLayer = useMemo(() => {
    if (!floor) {
      return null;
    }
    const sprite = floor === true ? floorSprite(width) : floor;
    return { sprite, x: 0, y: STAGE_FLOOR_LINE_Y + skyRows };
  }, [floor, width, skyRows]);

  // Live physics — `<BrixPhysicsProvider>` lets any consumer push
  // impulses into the mascot. The provider's offset shifts the body
  // (and its speaking-mouth overlay) within the stage canvas; the
  // floor stays anchored. With no provider in scope `useBrixImpulse()`
  // returns a no-op api whose offset is `{0, 0}`, so the stage renders
  // identically to its pre-physics behaviour.
  //
  // `offset.y` is height *above* the floor; the stage's y axis grows
  // downward, so we subtract it to lift the body upward.
  const { offset } = useBrixImpulse();
  // Tint the body and speaking overlay; particles keep their per-
  // particle color.
  const composed = useMemo(() => {
    const bodyLayer = {
      sprite: bodySprite,
      color: tint,
      x: offset.x,
      y: skyRows - offset.y,
    };
    const mouthLayer = speakingOverlay
      ? {
          ...speakingOverlay,
          color: tint,
          x: speakingOverlay.x + offset.x,
          y: speakingOverlay.y + skyRows - offset.y,
        }
      : null;
    const layers = [
      ...(floorLayer ? [floorLayer] : []),
      bodyLayer,
      ...(mouthLayer ? [mouthLayer] : []),
      particleSprite,
    ];
    return compose(layers, { width, height });
  }, [
    floorLayer,
    bodySprite,
    speakingOverlay,
    particleSprite,
    tint,
    width,
    height,
    skyRows,
    offset.x,
    offset.y,
  ]);

  const line = isPlaying && active.line ? stripMoodScript(active.line) : '';
  const bw = bubbleWidth ?? width;
  // Tail aligns with Brix's resting column relative to the bubble's box.
  const tailX = Math.max(1, Math.min(bw - 2, BUBBLE_TAIL_BODY_COL));

  return (
    <Box flexDirection="column" alignItems="flex-start">
      {bubble && line.length > 0 ? (
        <Bubble
          text={line}
          width={bw}
          variant="speech"
          tail="bottom"
          tailX={tailX}
          borderColor={tint}
        />
      ) : (
        // Reserve the bubble's vertical space (4 rows when bottom-tailed) so
        // the canvas doesn't bounce when emotes appear and disappear.
        <Box height={bubble ? 4 : 0} />
      )}
      <SpriteView sprite={composed} />
    </Box>
  );
}
