/**
 * BrikaOS splash — shown on launch.
 *
 *     ██████╗ ██████╗ ██╗██╗  ██╗ █████╗
 *     ██╔══██╗██╔══██╗██║██║ ██╔╝██╔══██╗
 *     ██████╔╝██████╔╝██║█████╔╝ ███████║
 *     ██╔══██╗██╔══██╗██║██╔═██╗ ██╔══██║
 *     ██████╔╝██║  ██║██║██║  ██╗██║  ██║
 *     ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
 *           BrikaOS · v0.1.0
 *
 *               ╭───╮
 *               │^◡^│
 *               ╰───╯
 *
 *           ✓  bribing the kernel
 *           ✓  reticulating splines
 *           ⠙  consulting the rubber duck…
 *
 *         © 1997-2026 Brika Labs
 *
 * Brix plays a randomly-picked friendly emote while a tiny braille
 * spinner ticks through a list of fake-but-funny startup steps. Each
 * boot shuffles fresh steps out of `STEP_POOL`, so the splash never
 * tells the same joke twice in a row. Any key press skips the splash
 * early; otherwise the shell auto-advances after a short "ready"
 * hold once every step has resolved.
 */

import { BrixStage, type EmoteName, EmoteProvider, useEmote } from '@brika/brix';
import { Spinner, useTerminalSize } from '@brika/tui';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

// ─── Public API ──────────────────────────────────────────────────────────

export interface BootScreenProps {
  readonly version: string;
  readonly onComplete: () => void;
}

export function BootScreen(props: Readonly<BootScreenProps>): React.ReactElement {
  return (
    <EmoteProvider>
      <BootSplash {...props} />
    </EmoteProvider>
  );
}

// ─── Tuning constants ────────────────────────────────────────────────────

/** Steps shown per boot — enough to read a couple of jokes (~2.5–3s
 *  of in-progress work) without overstaying the welcome. */
const STEPS_PER_BOOT = 6;
/** Min/max "thinking time" per step, in ms. Jittered so the cadence
 *  reads as "the OS is busy" not "a setTimeout in a loop". */
const STEP_MIN_MS = 240;
const STEP_JITTER_MS = 220;
/** Hold the all-green "ready" state before handing off to the shell.
 *  Long enough to actually see the final ✓ flip in. */
const READY_HOLD_MS = 700;
const COPYRIGHT = '© 1997-2026 Brika Labs';

// ─── Data ────────────────────────────────────────────────────────────────

interface BootStep {
  readonly label: string;
  readonly ms: number;
}

/** Half "vaguely technical", half "outright nonsense" — that ratio
 *  is what makes a fake loader actually funny instead of just cargo-
 *  culted from a SimCity install screen. */
const STEP_POOL: ReadonlyArray<string> = [
  // vaguely plausible
  'reticulating splines',
  'allocating bricks',
  'priming the runtime',
  'verifying checksums',
  'spawning daemons',
  'mounting the workspace',
  'hydrating state store',
  'warming the cache',
  'compiling the vibes',
  // outright nonsense
  'bribing the kernel',
  'consulting the rubber duck',
  'untangling cables',
  'petting the daemon',
  'caffeinating the runtime',
  'feeding the cron gerbils',
  'searching couch for semicolons',
  'spell-checking the regex',
  'whispering to the database',
  'ironing the YAML',
  'rolling a d20',
  'twirling brix’s mustache',
  'rebooting the rebooter',
  'inflating the data balloon',
  'distilling caffeine',
  'kicking the modem',
  'yelling at clouds',
  'reading the user’s mind',
  'pre-heating the bricks',
  'hand-knitting the CSS',
  'buttering the byte stream',
  'apologising to TypeScript',
  'negotiating with `node_modules`',
  'asking Brix nicely',
  'untying brix’s shoelaces',
  'evicting bugs',
  'paying off technical debt',
  'rotating the floppy',
];

/** ANSI Shadow figlet for "BRIKA". 6 rows × ~38 cells. */
const LOGO: ReadonlyArray<string> = [
  '██████╗ ██████╗ ██╗██╗  ██╗ █████╗ ',
  '██╔══██╗██╔══██╗██║██║ ██╔╝██╔══██╗',
  '██████╔╝██████╔╝██║█████╔╝ ███████║',
  '██╔══██╗██╔══██╗██║██╔═██╗ ██╔══██║',
  '██████╔╝██║  ██║██║██║  ██╗██║  ██║',
  '╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝',
];

/** One tint per logo row — a subtle gradient without per-letter masking. */
const LOGO_TINTS: ReadonlyArray<string> = [
  'cyan',
  'cyan',
  'magenta',
  'magenta',
  'yellow',
  'yellow',
];

/** Curated subset of `EMOTE_LIBRARY` that reads as "welcome / starting
 *  up". Negative or passive emotes (sleep, dead, oops, panic, yawn,
 *  shock, poop, …) are intentionally excluded so the splash never
 *  feels like a crash. */
const BOOT_EMOTES: ReadonlyArray<EmoteName> = [
  'wave',
  'celebrate',
  'hop',
  'love',
  'dance',
  'wink',
  'cool',
  'bow',
  'nod',
  'dash',
  'boogie',
  'somersault',
];

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Cosmetic random int in `[0, max)`. Uses `crypto.getRandomValues`
 *  so SonarQube (S2245) doesn't flag UI-only randomness. */
function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
}

function pickGreeting(): EmoteName {
  return BOOT_EMOTES[randomInt(BOOT_EMOTES.length)] ?? 'wave';
}

/** Pick `count` unique random steps from the pool with jittered ms. */
function pickSteps(count: number): ReadonlyArray<BootStep> {
  const taken = new Set<number>();
  const out: BootStep[] = [];
  while (out.length < count && taken.size < STEP_POOL.length) {
    const idx = randomInt(STEP_POOL.length);
    if (taken.has(idx)) {
      continue;
    }
    taken.add(idx);
    const label = STEP_POOL[idx];
    if (label) {
      out.push({ label, ms: STEP_MIN_MS + randomInt(STEP_JITTER_MS) });
    }
  }
  return out;
}

// ─── State machine ───────────────────────────────────────────────────────

type BootPhase = 'running' | 'ready';

interface BootSequence {
  readonly steps: ReadonlyArray<BootStep>;
  readonly greeting: EmoteName;
  /** Number of steps fully resolved. Equal to `steps.length` once
   *  every step is done — that's the cue for `phase === 'ready'`. */
  readonly currentIdx: number;
  readonly phase: BootPhase;
}

/** Drives the boot sequence: rolls greeting + step list once, ticks
 *  through each step on its own jittered timer, then holds in
 *  `ready` for `READY_HOLD_MS` before firing `onComplete`. */
function useBootSequence(onComplete: () => void): BootSequence {
  // Random picks happen once per mount. `useMemo([])` is deliberate —
  // we don't want HMR / StrictMode to re-roll mid-splash.
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

// ─── Layout ──────────────────────────────────────────────────────────────

function BootSplash({ version, onComplete }: Readonly<BootScreenProps>): React.ReactElement {
  const { columns, rows } = useTerminalSize();
  const api = useEmote();
  const { steps, greeting, currentIdx, phase } = useBootSequence(onComplete);

  useEffect(() => {
    api.play(greeting);
  }, [api, greeting]);

  // Skip on any key press.
  useInput(() => onComplete());

  return (
    <Box width={columns} height={Math.max(3, rows - 1)} alignItems="center" justifyContent="center">
      <Box flexDirection="column" alignItems="center">
        <BrandLogo />
        <BrandTagline version={version} />
        <Box marginTop={1}>
          <BrixStage bubble={false} floor={false} />
        </Box>
        <StepList steps={steps} currentIdx={currentIdx} />
        <ReadyOrCredit phase={phase} />
      </Box>
    </Box>
  );
}

function BrandLogo(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="flex-start">
      {LOGO.map((line, i) => (
        <Text key={line} color={LOGO_TINTS[i] ?? 'cyan'} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}

function BrandTagline({ version }: Readonly<{ version: string }>): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text bold>BrikaOS </Text>
      <Text dimColor>· v{version}</Text>
    </Box>
  );
}

function StepList({
  steps,
  currentIdx,
}: Readonly<{ steps: ReadonlyArray<BootStep>; currentIdx: number }>): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      {steps.map((step, i) => (
        <StepRow key={step.label} step={step} status={statusFor(i, currentIdx)} />
      ))}
    </Box>
  );
}

type StepStatus = 'pending' | 'active' | 'done';

function statusFor(index: number, currentIdx: number): StepStatus {
  if (index < currentIdx) {
    return 'done';
  }
  if (index === currentIdx) {
    return 'active';
  }
  return 'pending';
}

function StepRow({
  step,
  status,
}: Readonly<{ step: BootStep; status: StepStatus }>): React.ReactElement {
  if (status === 'done') {
    return (
      <Box>
        <Text color="green">✓</Text>
        <Text dimColor>{`  ${step.label}`}</Text>
      </Box>
    );
  }
  if (status === 'active') {
    return (
      <Box>
        <Spinner color="cyan" />
        <Text>{`  ${step.label}…`}</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text dimColor>·</Text>
      <Text dimColor>{`  ${step.label}`}</Text>
    </Box>
  );
}

/** Flips between the copyright line and a brief "ready" celebration
 *  once every step has resolved. Same row height in both states so
 *  the layout doesn't jump. */
function ReadyOrCredit({ phase }: Readonly<{ phase: BootPhase }>): React.ReactElement {
  if (phase === 'ready') {
    return (
      <Box marginTop={1}>
        <Text color="green" bold>
          ✓ ready
        </Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>{COPYRIGHT}</Text>
    </Box>
  );
}
