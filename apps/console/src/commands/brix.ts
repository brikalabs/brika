/**
 * `brika brix` — easter egg.
 *
 * Drops the operator straight into Brix Run, the side-scrolling
 * platformer that normally lives behind the `brix` route in the
 * dashboard. No sidebar, no shell chrome — just the game.
 *
 * Hidden from `brika help` on purpose (`hidden: true`). Discoverable
 * via `brika brix --help` if you know the name, but it doesn't
 * advertise itself in the main command listing — that's the whole
 * point of an easter egg.
 *
 * Controls:
 *   space / ↑     jump
 *   ↓ / s         crouch
 *   ← / a         move left
 *   → / d         move right
 *   p             pause
 *   r             reset
 *   Ctrl+C        quit
 */

import { defineCommand } from '@brika/cli';
import React from 'react';
import { BrixView } from '../features/brix';
import { runCommandTui } from '../runCommandTui';

export default defineCommand({
  name: 'brix',
  description: 'Play Brix Run — the hidden side-scroller (no shell, just the game)',
  hidden: true,
  examples: ['brika brix'],
  async handler() {
    await runCommandTui(
      React.createElement(BrixView),
      // Plain fallback for non-TTY environments — running a side-scroller
      // through a pipe isn't useful, but we still want a polite message
      // instead of nothing.
      () => {
        process.stdout.write('Brix Run needs an interactive terminal.\n');
      }
    );
  },
});
