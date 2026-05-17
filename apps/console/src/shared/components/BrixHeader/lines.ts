/**
 * Everything Brix says, grouped by intent.
 *
 *   REACTIONS                hub-state greetings (one-shot on transition)
 *   HUB_EMOTES               body emote that pairs with each greeting
 *   IDLE_LINES_BY_STATE      what Brix muses when the hub sits at state X
 *   COMMON_IDLE_LINES        general musings, hub-state-agnostic
 *   TIME_OF_DAY_LINES        time-aware quips (morning/afternoon/...)
 *   RANDOM_THOUGHTS          rare non-sequiturs — the "weird and alive" bits
 *   OUCH_MILD / OUCH_ANNOYED tiered poke reactions (streak escalates them)
 *   UNLOCK_LINE              the line he says when the easter-egg fires
 *
 * Lines may include two flavours of inline markup:
 *
 *   `{:emote:}`   parsed by `brixHostReducer` (via `parseMoodScript`).
 *                 Stripped from the visible string and dispatched as a
 *                 body emote (mood) on the EmoteProvider.
 *   `§<code>`     parsed by `formatCodes.ts` at render time. Adds bold
 *                 (`§l`), italic (`§o`), color (`§0`–`§f`), obfuscated
 *                 (`§k`), rainbow (`§R`), big (`§B`), reset (`§r`).
 *
 * The two layers don't conflict — one drives the mascot's body, the
 * other styles the text in the bubble.
 */

import type { EmoteName } from '@brika/brix';
import type { Reaction } from './brixHostReducer';
import type { TimeOfDay } from './timeOfDay';

export type HubState = 'running' | 'stale' | 'stopped' | 'unknown';

// ─── State-transition greetings ───────────────────────────────────────────

export const REACTIONS: Readonly<Record<HubState, Reaction | null>> = {
  running: { kind: 'wave', color: 'green', line: 'hub is awake — hi!' },
  stale: { kind: 'oops', color: 'yellow', line: 'that pid looks stale.' },
  stopped: { kind: 'sleep', color: 'gray', line: 'hub is asleep — Ctrl+S to wake.' },
  unknown: null,
};

export const HUB_EMOTES: Readonly<Record<HubState, EmoteName | null>> = {
  running: 'wave',
  stale: 'oops',
  stopped: 'sleep',
  unknown: null,
};

// ─── Idle chatter (hub-state aware) ───────────────────────────────────────

export const IDLE_LINES_BY_STATE: Readonly<Record<HubState, ReadonlyArray<string>>> = {
  running: [
    'hub is §2humming§r along.',
    'all systems §lquiet§r.',
    'nothing to fix, nothing to break.',
    'we’re in the §agreen§r.',
    'everything’s where it should be.',
    'the pipes are flowing.',
    'I can hear the daemons §owhispering§r.',
    '{:happy:}§Rsmooth sailing§r.',
    '{:cool:}we look §lgood§r doing it.',
    'gear count: nominal.',
  ],
  stopped: [
    'hub is sleeping — Ctrl+S to wake it.',
    'nothing to watch — yet.',
    '{:sleep:}sweet dreams, little hub.',
    'zzz.',
    'the silence is nice, actually.',
    'go on, wake it up.',
    'when you’re ready.',
    'I’ll be here.',
    '{:shy:}we could just… vibe?',
  ],
  stale: [
    'that pid looks stale — try r.',
    'something’s off in pid-land.',
    'the pid file lies.',
    'stale crumbs everywhere.',
    '{:suspicious:}I don’t trust that number.',
  ],
  unknown: [
    '{:thinking:}checking the hub…',
    'one moment, peeking inside.',
  ],
};

// ─── Common chatter (any state) ───────────────────────────────────────────

export const COMMON_IDLE_LINES: ReadonlyArray<string> = [
  'i’m just chilling.',
  'press ? for help.',
  'tiny blocks. big automation.',
  'still here.',
  'the keyboard’s warm.',
  'what’s brewing?',
  '{:happy:}you’re doing great.',
  'I was thinking about pipelines.',
  'I count daemons when I can’t sleep.',
  'I dreamt I was a workflow.',
  'press ? if you forget anything.',
  '`q` quits if you must.',
  'you can poke me, you know.',
  '{:cheeky:}go on. poke me.',
  'Do you know Clay?',
  'I hope you’re not overworking.',
  'Take a break, you know.',
  'I am Brix !',
  'Do you want to build a workflow ?',
  'Ok Google, turn on the hub.',
  'Hey Siri, what’s the hub status?',
  'Alexa, ask the hub who’s there?',
  '{:cheeky:}Try "brika brix" in the terminal.',
];

// ─── Time-of-day quips ────────────────────────────────────────────────────

export const TIME_OF_DAY_LINES: Readonly<Record<TimeOfDay, ReadonlyArray<string>>> = {
  morning: [
    '{:happy:}morning shift, eh?',
    'coffee or chaos first?',
    'the sun’s up — let’s go.',
    'fresh keyboard energy.',
    '{:proud:}early-bird mode engaged.',
  ],
  afternoon: [
    'afternoon arc.',
    'past the midday hump.',
    'second wind territory.',
    'snack break thoughts.',
  ],
  evening: [
    'evening run.',
    'wrapping up?',
    'almost golden hour.',
    '{:cool:}the productive hours, allegedly.',
  ],
  night: [
    'still up?',
    'the moonlit shift.',
    '{:cool:}night-owl, respect.',
    'the cron jobs are louder at night.',
  ],
  late: [
    '{:tired:}it’s late. are you okay?',
    'go to bed, friend.',
    'the hub never sleeps. but you should.',
    '{:sad:}I’ll cover the night. you rest.',
    '{:suspicious:}why are we both still here?',
  ],
};

// ─── Random non-sequiturs (the "alive" sauce) ─────────────────────────────

export const RANDOM_THOUGHTS: ReadonlyArray<string> = [
  '{:starry:}I had a dream about gears.',
  'do bricks dream of mortar?',
  'I left the stove on. metaphorically.',
  '{:suspicious:}I’m 60% certain I exist.',
  'do you ever just… loop?',
  '{:love:}imagine a YAML so clean it cries.',
  'my best mate is a stray daemon.',
  '{:cool:}I tried meditation. counted to `Infinity`.',
  '{:curious:}I wonder what Brika smells like.',
  'I think the cron jobs are gossiping again.',
  '{:cheeky:}I’m not avoiding work. I’m gathering momentum.',
  '{:thinking:}if a workflow runs and nobody asserts, did it succeed?',
  'I have opinions about tabs.',
  'I once watched a deploy. it watched back.',
  '{:starry:}brick by brick, we get there.',
  'I miss the old logo. (kidding. mostly.)',
  '{:proud:}I’m fluent in three protocols and a stare.',
];

// ─── Poke reactions (escalate with streak) ────────────────────────────────

export const OUCH_MILD: ReadonlyArray<string> = [
  '{:oops:}ouch!',
  '{:oops:}hey!',
  '{:oops:}ow!',
  '{:oops:}hmph!',
  '{:oops:}eek!',
  '{:oops:}oof!',
  '{:oops:}ack!',
  '{:oops:}oh!',
  '{:oops:}oi!',
  '{:oops:}yipes!',
  '{:oops:}owie!',
  '{:oops:}ay!',
  '{:oops:}careful!',
  '{:boop:}boop right back.',
  '{:shy:}gentle, please.',
  '{:cheeky:}is that a hello?',
  '{:wink:}I felt that.',
];

export const OUCH_ANNOYED: ReadonlyArray<string> = [
  '{:angry:}stop that!',
  '{:angry:}cut it out!',
  '{:angry:}knock it off!',
  '{:angry:}quit it!',
  '{:angry:}§l§4HEY§r!',
  '{:angry:}§lENOUGH§r!',
  '{:angry:}watch it!',
  '{:angry:}easy now!',
  '{:angry:}give it a rest!',
  '{:suspicious:}you again?',
  '{:tired:}I’m §omade of bricks§r, you know.',
  '{:angry:}HR is §kgossiping§r about this.',
  '{:angry:}that’s §lassault§r!',
  '{:suspicious:}you’re an §oodd§r one.',
  '{:angry:}§6one§r §4star§r. §6one§r. §4star§r.',
  '{:tired:}§otouch grass§r, I beg.',
  '{:angry:}this is going in the §lchangelog§r.',
  '{:suspicious:}I will §lremember§r this.',
  '{:angry:}do that again. §lI dare you§r.',
  '{:angry:}§Rrainbow§r rage incoming.',
  '{:suspicious:}§kREDACTED§r.',
];

/** Magenta line the bubble flips to when the rapid-tap unlock fires. */
export const UNLOCK_LINE = '{:starry:}§Rokay okay — going§r!';

// ─── Death + epitaph ──────────────────────────────────────────────────────

/** Final words the bubble shows when Brix dies from too many pokes.
 *  One is picked at random. Mood is `dead`; tint is forced red. */
export const DEATH_LINES: ReadonlyArray<string> = [
  '{:dead:}§4you... win.',
  '{:dead:}§4tell my brick mum I love her.',
  '{:dead:}§4§let tu, brute§r?',
  '{:dead:}§4goodbye, cruel terminal.',
  '{:dead:}§4§l404§r soul not found.',
  '{:dead:}§4it was a good run.',
  '{:dead:}§4poked to death. who knew.',
  '{:dead:}§4tell my story.',
];

/** Murmur shown on the tombstone — picked once per death, no typewriter. */
export const EPITAPHS: ReadonlyArray<string> = [
  'here lies Brix\nloved, then poked',
  'Brix\n1997 — today\n"ouch"',
  'R.I.P. Brix\nkilled by the cursor',
  'Brix\ngone too soon\n(probably)',
  'here rests Brix\ndeath by 1000 pokes',
];
