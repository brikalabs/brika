# @brika/brix

Brix is the tiny mascot that lives inside the Brika CLI. This package is its rendering and animation engine: a layered sprite stage, an emote library, a particle system, a 1-D physics step, and the speech bubbles.

```bash
bun add @brika/brix ink react
```

`ink` and `react` are peer dependencies (`ink ^6`, `react ^18 || ^19`).

Brix is **terminal-native**: every visual is a multi-row sprite made of UTF-8 cells with optional ANSI colour. No PNGs, no canvas, no escape into a child process.

```tsx
import { BrixStage, EmoteProvider, useEmote } from '@brika/brix';

function Mascot() {
  return (
    <EmoteProvider>
      <BrixStage />
      <Controls />
    </EmoteProvider>
  );
}

function Controls() {
  const emote = useEmote();
  return <Button onPress={() => emote.play('wave')}>say hi</Button>;
}
```

---

## Architecture

Layered from pure data to React glue. Each layer only depends on the ones below it.

```
   BrixStage · EmoteProvider · SpriteView · Bubble       ← React components
   useTimeline · useParticles                            ← React adapters
   emotes/* (DSL + library)                              ← author surface
   brick · stageSprites · faces                          ← sprite shaping
   sprite · timeline · particles · physics               ← pure kernels
   rng · script · moods                                  ← misc primitives
```

**Why pure kernels?** Animation logic is data, not behaviour. `timeline.ts` builds a structure you can step through deterministically; `particles.ts` is a pure `(field, dt) => field` reducer; `physics.ts` is one line of Euler integration. The React layer only schedules ticks and re-renders.

---

## Sprite model

A `Sprite` is a 2-D grid of `Cell`s. Each cell carries one printable character plus optional `color` / `bgColor`. Sprites are immutable; helpers return new ones.

```ts
import { parseSprite, compose, tint, translate, type Sprite } from '@brika/brix';

// Multi-line string → Sprite. Whitespace becomes "empty cell".
const face = parseSprite(`
  ^_^
  ‿
`);

// Translate to a stage position.
const placed = translate(face, { x: 4, y: 2 });

// Compose layers (back-to-front).
const frame = compose({ width: 24, height: 8 }, [
  { sprite: floor, placement: { x: 0, y: 7 } },
  { sprite: placed },
]);

// Recolour all non-empty cells.
const angry = tint(face, { color: 'red' });
```

`stageSprites.ts` defines the canonical stage geometry (`STAGE_WIDTH`, `STAGE_HEIGHT`, floor lines), the body brick, and every named face (`FACE_HAPPY`, `FACE_SLEEPY`, `FACE_LOVE`, …). `FACE_BY_NAME` maps a `FaceName` to its sprite.

---

## Timelines

A `Timeline` is a recursive structure of `Clip`s (`Track`, `Sequence`, `Parallel`) with explicit durations. `clipFrameAt(clip, t)` returns the frame at a millisecond cursor — pure, deterministic, side-effect-free.

```ts
import { clip, track, sequence, parallel, timelineDuration } from '@brika/brix';

const wave = sequence([
  clip(FACE_HAPPY, 200),
  clip(FACE_WINK, 120),
  clip(FACE_HAPPY, 200),
]);

const eyes = track([clip(FACE_NEUTRAL, 800), clip(FACE_BLINK, 80), clip(FACE_NEUTRAL, 1200)]);

const both = parallel([wave, eyes]);

timelineDuration(both); // total ms
```

In React, use `useTimeline(timeline)` to get the current frame on a 60ms interval (configurable):

```tsx
import { useTimeline } from '@brika/brix';

const { frame, t, done } = useTimeline(both, { interval: 50, active: isPlaying });
```

---

## Emotes

An `EmoteDef` is a named, parameterised timeline. The library (`emotes/`) ships ~30 emotes — `idle`, `wave`, `wink`, `nod`, `think`, `dance`, `love`, `panic`, `sleep`, `nom`, `peek`, and so on. `defineEmote(builder)` is the authoring DSL: a builder that returns a timeline + optional particle emitter + optional bubble line.

```ts
import { defineEmote, EMOTE_LIBRARY } from '@brika/brix';

const cheer = defineEmote('cheer', (b) =>
  b.frames([
    b.frame({ face: 'happy', body: 'jump' }, 120),
    b.frame({ face: 'starry', body: 'land' }, 160),
  ]).particles(b.confetti({ origin: { x: 10, y: 0 } })),
);
```

`<EmoteProvider>` exposes a bus (`useEmote()`) for triggering emotes from anywhere in the tree:

```tsx
const emote = useEmote();
emote.play('cheer');
emote.play('wave', { priority: 'high' }); // pre-empt anything lower
emote.cancel(); // back to idle
```

`useEmoteOn(eventName, emote)` is sugar for subscribing to an arbitrary event-bus event without prop drilling.

---

## Particles

`particles.ts` provides a tiny field simulator: emitters drop particles at a configured rate, each particle has position / velocity / lifetime, and `stepField(field, dtMs)` advances everything one tick.

```ts
import { emptyField, stepField, renderField, rateEmitter, confetti } from '@brika/brix';

let field = emptyField();
const emitter = rateEmitter(confetti, { perSecond: 8, origin: { x: 6, y: 0 } });

// Each tick:
field = stepField(field, 50, [emitter]);
const sprite = renderField(field, { width: 24, height: 8 });
```

`particleEmitters.ts` ships ready-made emitters and their character sets:

| Emitter     | Glyphs              | Used by                       |
| ----------- | ------------------- | ----------------------------- |
| `confetti`  | `* + . o`           | celebration emotes            |
| `hearts`    | `♡ ♥ ❤`              | `love`, `crush`               |
| `sparkles`  | `✦ ✧ · *`           | `starry`, `success`           |
| `notes`     | `♪ ♫`               | `dance`, `boogie`             |
| `zZz`       | `z Z ⓩ`              | `sleep`, `yawn`               |

In React, `useParticles(emitters)` returns the rendered field sprite on every frame.

---

## Physics

`physics.ts` is a one-axis Euler integrator scoped to Brix's body brick: position, velocity, gravity, grounded-state, optional jumps. It's used by movement emotes (`dash`, `hop`, `somersault`, the `brix-run` mini-game) — not the body of Brix at rest.

```ts
import { makeBrick, stepPhysics, GRAVITY } from '@brika/brix';

let brick = makeBrick({ x: 4, y: STAGE_FLOOR_Y, vy: -3 });
brick = stepPhysics(brick, 50 /* ms */, { gravity: GRAVITY });
```

---

## Bubble

`<Bubble>` renders a sized speech bubble next to the stage with an optional tail glyph. The mood-script parser in `script.ts` lets author lines flip Brix's face mid-sentence:

```ts
import { parseMoodScript, expandReveal } from '@brika/brix';

const tokens = parseMoodScript('{:thinking:}untangling…{:happy:}done!');
const reveal = expandReveal(tokens, { charMs: 28, wordPauseMs: 180 });
```

`expandReveal` is the per-character pacing stream: word boundaries get a `wordPauseMs` breath, sentence-ends get `sentencePauseMs`, clause breaks (`,;:`) get `clausePauseMs`. The talking host just walks the cursor and reads `pauseMs` for each step.

---

## Moods

`Mood` is a short, fixed vocabulary of named expressions (`idle | happy | thinking | shy | suspicious | tired | …`). Each mood maps to a face + a default colour at the consumer layer. `ALL_MOODS` is the exhaustive list; the mood-script parser preserves unknown `{:foo:}` tokens as literal text so authors notice typos at render time.

---

## Determinism

`rng.ts` exposes a tiny seedable PRNG so anything that uses randomness — particle jitter, idle-line picks, the mini-game obstacles — can be replayed step-for-step from a seed. Plain `Math.random` is never called from kernels.

---

## Development

```bash
bun --filter @brika/brix test         # unit tests
bun --filter @brika/brix typecheck    # tsgo --noEmit
```

Tests are colocated as `*.test.ts`. The pure kernels (`sprite`, `timeline`, `particles`, `moods`, `script`) carry most of the coverage and run in single-digit milliseconds.

---

## Conventions

- Component props are wrapped in `Readonly<>`.
- No `as` casts and no `any`. Use type guards, narrowing, or `unknown` + runtime checks.
- Default to no comments. When a comment is justified, explain **why** the code looks the way it does, not what it does.
- Anything that grows beyond the stage (mini-games, scenes) belongs alongside the kernels in this package, not in `apps/console` — keep the CLI free of game logic.
