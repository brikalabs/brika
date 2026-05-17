/**
 * Boot-splash step list + its data layer.
 *
 * The pool is roughly half "vaguely technical" / half "outright
 * nonsense" — that ratio is what makes a fake loader actually funny
 * instead of cargo-culted from a SimCity install screen. Per-step
 * timings are jittered so the cadence reads as "the OS is busy" not
 * "a setTimeout in a loop".
 */

import { Spinner } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { randomInt } from './random';

/** Min "thinking time" added to every step, in ms. */
const STEP_MIN_MS = 240;
/** Extra random delay layered on top of the min, in ms. */
const STEP_JITTER_MS = 220;

export interface BootStep {
  readonly label: string;
  readonly ms: number;
}

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

/** Pick `count` unique random steps from the pool with jittered ms. */
export function pickSteps(count: number): ReadonlyArray<BootStep> {
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

// ─── Presentation ─────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'done';

function statusFor(index: number, currentIdx: number): StepStatus {
  if (index < currentIdx) return 'done';
  if (index === currentIdx) return 'active';
  return 'pending';
}

interface StepListProps {
  readonly steps: ReadonlyArray<BootStep>;
  readonly currentIdx: number;
}

export function StepList({ steps, currentIdx }: Readonly<StepListProps>): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      {steps.map((step, i) => (
        <StepRow key={step.label} step={step} status={statusFor(i, currentIdx)} />
      ))}
    </Box>
  );
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
