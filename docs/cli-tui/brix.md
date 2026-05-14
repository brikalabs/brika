# `@brika/brix` — mascot package

Brix is the tiny runtime creature inside Brika. This package owns
everything that gives the CLI its personality: the face glyph table, the
animation frame sets, the speech bubble, the header, the statusline, and a
small narration logger.

## Personality (single‑source‑of‑truth)

Brix is **cute, calm, modular, observant, playful, tiny, terminal‑native,
slightly curious — never corporate, never verbose, never overly “AI
assistant”**. He narrates softly, in lowercase, in fragments.

Acceptable:

```
(◔◡◔) resolving blocks…
(^◡^) workflow deployed
(•~•) waiting for filesystem events
(×◠×) that plugin exploded politely
```

Not acceptable:

```
✓ Successfully deployed your workflow! 🎉
✗ Error: Failed to load plugin configuration.
Hello! I'd be happy to help you with that.
```

The mood enum is the only API surface for choosing a face; copy is the
caller's responsibility (Brix is a narrator, not a copywriter).

## Moods

```ts
export type Mood =
  | 'idle'        // (•◡•)
  | 'happy'       // (^◡^)
  | 'excited'     // (◕▿◕)
  | 'thinking'    // (◔◡◔)
  | 'focused'     // (•~•)
  | 'curious'     // (⊙◡⊙)
  | 'sleep'       // (-◡-) zZ
  | 'sad'         // (╥◡╥)
  | 'error'       // (×◠×)
  | 'dead'        // (x_x)
  | 'panic'       // (⊙▂⊙)
  | 'angry'       // (•̀◠•́)
  | 'suspicious'  // (¬◡¬)
  | 'love'        // (♡◡♡)
  | 'cool'        // (⌐◡◠)
  | 'loading'     // (•▁•)
  | 'success'     // (◕‿◕)
  | 'default';    // (◕◡◕)
```

A separate `bracket: 'round' | 'square' | 'angle' | 'curly'` prop swaps the
delimiters: `(◕◡◕)` → `[◕◡◕]` → `<◕◡◕>` → `{◕◡◕}`. Default `round`.

## Animations

Frame sets live next to the moods. Each animation is a `readonly string[]`
plus a default `intervalMs`.

```ts
export const ANIMATIONS = {
  loading:   { frames: ['(•  •)', '(•▁•)', '(•▃•)', '(•▄•)', '(•▆•)', '(•█•)'], intervalMs: 120 },
  thinking:  { frames: ['(•◡•)', '(◔◡◔)', '(◔▿◔)', '(◔◡◔)'],                   intervalMs: 220 },
  breathing: { frames: ['(•◡•)', '(•ᴗ•)', '(•◡•)'],                              intervalMs: 600 },
  talking:   { frames: ['(◕◡◕)', '(◕▿◕)', '(◕◠◕)', '(◕◡◕)'],                   intervalMs: 140 },
  sleep:     { frames: ['(-◡-)', '(-◡-) z', '(-◡-) zZ', '(-◡-) zZz'],            intervalMs: 600 },
  panic:     { frames: ['(⊙▂⊙)', '(⊙▃⊙)', '(⊙▂⊙)'],                              intervalMs: 110 },
  error:     { frames: ['(×◠×)', '(×▂×)', '(x_x)'],                              intervalMs: 220 },
} as const;
```

Animations build on `@brika/tui`'s `Spinner` pattern (`useState` + `setInterval`),
not on an external animation lib.

## Components

### `<Brix />`

```tsx
<Brix mood="thinking" />                 // (◔◡◔)
<Brix mood="happy" bracket="square" />   // [^◡^]
<Brix mood="sleep" />                    // (-◡-) zZ
```

Single character cell (or two for sleep/panic w/ trailing chars). Inline
safe — designed to live next to text without breaking column alignment.

### `<BrixAnimated kind="thinking" />`

Same shape but cycles through the animation frame set on its interval.
Cleaned up on unmount.

### `<BrixSay />`

Speech bubble — top‑oriented (Brix below) or bottom‑oriented (Brix above).
Default top.

```
╭──────────────────────╮
│ workflow deployed!   │
╰──────────────────────╯
       (^◡^)
```

```tsx
<BrixSay mood="happy" text="workflow deployed!" />
<BrixSay mood="thinking" text="untangling blocks…" orient="above" />
```

### `<BrixHeader />`

The full startup card.

```
╭────────────────────────────────────────────╮
│ (◕◡◕) Brika Runtime v0.1.0                │
│                                            │
│ workspace: ~/projects/brika               │
│ plugins: 12                               │
│ workflows: 4                              │
│ status: watching                           │
╰────────────────────────────────────────────╯
```

Props:

```ts
interface BrixHeaderProps {
  readonly version: string;
  readonly workspace: string;
  readonly plugins: number;
  readonly workflows: number;
  readonly status: string;     // freeform: "watching", "booting", "stopped"…
  readonly mood?: Mood;        // default 'default'
}
```

A minimal variant `<BrixHeader compact />` renders a single line:
`(◕◡◕) Brika Runtime`.

### `<BrixStatusline />`

One‑line compact status; intended for the bottom of a TUI or as a
one‑shot print.

```
(•◡•) watching workflows
(◔◡◔) building automation graph
(^◡^) runtime ready
```

```tsx
<BrixStatusline mood="thinking" text="building automation graph" />
```

## `brixLog` narrator

Non‑Ink, plain `process.stdout.write` — used by one‑shot subcommands that
don't render a full tree.

```ts
import { brix } from '@brika/brix';

brix.info('booting…');               // (•◡•) booting…
brix.think('resolving blocks…');     // (◔◡◔) resolving blocks…
brix.ok('workflow deployed');        // (^◡^) workflow deployed
brix.warn('that plugin is slow');    // (•~•) that plugin is slow
brix.fail('plugin crashed');         // (×◠×) plugin crashed
brix.panic('runtime stalled');       // (⊙▂⊙) runtime stalled
brix.dead('hub did not recover');    // (x_x) hub did not recover
```

Implementation is a thin map from method → `Mood`, with picocolors for the
mood face only (text stays default). NO_COLOR respected.

There's also a `brix.spinner('booting…')` that returns `{ stop, succeed,
fail }` — wraps a `setInterval` loop over the `loading` frame set and
clears the line on `stop()`. Useful in non‑Ink command handlers.

## Branding constants

`@brika/brix/brand`:

```ts
export const BRIKA_WORDMARK = '▰▰ Brika Runtime';
export const TAGLINE = 'tiny blocks. big automation.';
export const BRAND_LINE = (version: string) =>
  `brika v${version} · built by the Brika Labs team`;
```

Mortar's `brand.ts` stays in mortar (`▰▰ mortar`). The two are intentionally
separate — Brix only narrates Brika.

## Package shape

```
packages/brix/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    moods.ts
    animations.ts
    brand.ts
    Brix.tsx
    BrixAnimated.tsx
    BrixSay.tsx
    BrixHeader.tsx
    BrixStatusline.tsx
    brixLog.ts
    brixLog.test.ts
    moods.test.ts
```

## Tests

- `moods.test.ts`: every `Mood` key maps to a non‑empty face string;
  bracket variants render correctly for a sample.
- `brixLog.test.ts`: each method writes the expected face prefix; NO_COLOR
  suppresses ANSI codes; `brix.spinner().stop()` clears the line.
- (Manual) animation visual check via a tiny example app under
  `packages/brix/examples/`.
