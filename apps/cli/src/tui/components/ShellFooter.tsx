/**
 * Bottom strip — global hub controls + navigation reference. Brix
 * lives in `<BrixHeader>` at the top of the shell; the footer is
 * intentionally one line tall so the active view gets the most
 * vertical space.
 *
 * Hub actions (`start` / `stop` / `restart` / `open`) are real
 * `<Button>`s — click them, hit the shortcut, or Tab onto them. They
 * opt out of the Tab cycle (`tabIndex={-1}`) so Tab stays within the
 * active view's controls; click + shortcut still work.
 *
 * The nav keys (`1-8`, `[ ]`, `?`, `q`) stay as `<Hint>` chips since
 * each one drives the router, not a single clickable target — the
 * corresponding `useKey` binds live in `useShellKeys`.
 */

import { Button, Hint, HintBar, useBreakpoint } from '@brika/tui';
import type React from 'react';
import { useCli } from '../useCli';

export function ShellFooter(): React.ReactElement {
  const bp = useBreakpoint();
  const cli = useCli();
  const running = cli.hub.state === 'running';
  return (
    <HintBar>
      <Hint k="1-8">tabs</Hint>
      {bp.md ? <Hint k="[ ]">cycle</Hint> : null}
      {bp.sm ? (
        <Button
          shortcut="ctrl+s"
          variant="success"
          tabIndex={-1}
          enabled={!running}
          onPress={() => void cli.startHub()}
        >
          start
        </Button>
      ) : null}
      {bp.sm ? (
        <Button
          shortcut="ctrl+x"
          variant="warning"
          tabIndex={-1}
          enabled={running}
          onPress={() => void cli.stopHub()}
        >
          stop
        </Button>
      ) : null}
      {bp.md ? (
        <Button
          shortcut="ctrl+r"
          tabIndex={-1}
          enabled={running}
          onPress={() => void cli.restartHub()}
        >
          restart
        </Button>
      ) : null}
      {bp.md ? (
        <Button shortcut="ctrl+o" tabIndex={-1} enabled={running} onPress={() => void cli.openUi()}>
          open
        </Button>
      ) : null}
      <Hint k="?">help</Hint>
      <Hint k="q" accent="destructive">
        quit
      </Hint>
    </HintBar>
  );
}
