/**
 * `<BootScreen>` — public entry for the boot splash feature.
 *
 * Brix plays a randomly-picked friendly emote while a tiny braille
 * spinner ticks through a list of fake-but-funny startup steps. Each
 * boot shuffles fresh steps so the splash never tells the same joke
 * twice in a row. Any key press skips the splash early; otherwise the
 * shell auto-advances after a short "ready" hold once every step has
 * resolved.
 *
 * This module owns wiring (`EmoteProvider`) and re-exports the inner
 * layout for tests / dev-launcher use. All of the visual atoms, data,
 * and the state machine live in sibling files:
 *
 *   Brand.tsx           figlet logo + version tagline
 *   StepList.tsx        STEP_POOL, BootStep, StepRow, StepList
 *   ReadyLine.tsx       copyright / "✓ ready" toggle
 *   useBootSequence.ts  picks + ticks + ready-hold timer
 *   random.ts           cosmetic crypto-backed randomInt + pickGreeting
 *   copyright.ts        date-aware copyright line
 */

import { EmoteProvider } from '@brika/brix';
import type React from 'react';
import { BootSplash, type BootSplashProps } from './BootSplash';

export type BootScreenProps = BootSplashProps;

export function BootScreen(props: Readonly<BootScreenProps>): React.ReactElement {
  return (
    <EmoteProvider>
      <BootSplash {...props} />
    </EmoteProvider>
  );
}
