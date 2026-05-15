/**
 * Outer chrome for every section of the brika TUI.
 *
 *   ╭ Brika · v0.1.0 ──────────────────────── ● running pid ─╮
 *   │  BrixHeader  (Brix + speech bubble)                    │
 *   │  NavBar      (responsive top-level tabs)               │
 *   │ ───────────────────────────────────────────────────── │
 *   │  Outlet      (active view)                             │
 *   │  ShellFooter (key hints)                               │
 *   ╰────────────────────────────────────────────────────────╯
 *
 * `<AppShell>` owns the outer window frame, inline title, and the
 * "terminal too small" guard. When the user shrinks past the minimum,
 * we pass our own crying-Brix mascot (the multi-line `<BrixStage>`
 * playing the `cry` emote) so the warning screen stays on-brand.
 */

import { BrixStage, EmoteProvider, useEmote } from '@brika/brix';
import { AppShell, AppShellDivider, AppShellSection, Outlet } from '@brika/tui';
import type React from 'react';
import { useEffect } from 'react';
import { useCli } from '../useCli';
import { BrixHeader } from './BrixHeader';
import { NavBar } from './NavBar';
import { ShellFooter } from './ShellFooter';

export function ShellLayout(): React.ReactElement {
  const cli = useCli();
  const titleRight = hubTitleStamp(cli.hub);
  return (
    <AppShell
      title={`Brika · v${cli.version}`}
      titleRight={titleRight}
      accent="cyan"
      tooSmallMascot={<CryingBrix />}
    >
      <AppShellSection>
        <BrixHeader />
      </AppShellSection>
      <AppShellSection>
        <NavBar />
      </AppShellSection>
      <AppShellDivider />
      <AppShellSection grow>
        <Outlet />
      </AppShellSection>
      <AppShellSection>
        <ShellFooter />
      </AppShellSection>
    </AppShell>
  );
}

function hubTitleStamp(hub: ReturnType<typeof useCli>['hub']): string {
  switch (hub.state) {
    case 'running':
      return hub.pid === null ? '● running' : `● running pid ${hub.pid}`;
    case 'stale':
      return `● stale pid ${hub.pid}`;
    case 'stopped':
      return '◌ stopped';
    case 'unknown':
      return 'checking…';
  }
}

/** Multi-line Brix on his own `EmoteProvider` so the `cry` loop runs
 *  even though the main shell hasn't mounted (the "too small" screen
 *  bypasses `<BrixHeader>` entirely). */
function CryingBrix(): React.ReactElement {
  return (
    <EmoteProvider>
      <CryingBrixInner />
    </EmoteProvider>
  );
}

function CryingBrixInner(): React.ReactElement {
  const api = useEmote();
  useEffect(() => {
    api.play('cry');
  }, [api]);
  return <BrixStage bubble={false} floor={false} />;
}
