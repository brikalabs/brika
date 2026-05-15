/**
 * Bottom strip — global keybind reference. Brix lives in
 * `<BrixHeader>` at the top of the shell; the footer is intentionally
 * one line tall so the active view gets the most vertical space.
 *
 * Responsive: on narrow terminals only the essentials are shown
 * (nav + help + quit). The hub-control quartet appears at `sm+` and
 * the cycle keys appear at `md+`.
 */

import { Hint, HintBar, useBreakpoint } from '@brika/tui';
import type React from 'react';

export function ShellFooter(): React.ReactElement {
  const bp = useBreakpoint();
  return (
    <HintBar>
      <Hint k="1-8">tabs</Hint>
      {bp.md ? <Hint k="[ ]">cycle</Hint> : null}
      {bp.sm ? (
        <Hint k="^S" accent="success">
          start
        </Hint>
      ) : null}
      {bp.sm ? (
        <Hint k="^X" accent="warning">
          stop
        </Hint>
      ) : null}
      {bp.md ? <Hint k="^R">restart</Hint> : null}
      {bp.md ? (
        <Hint k="^O" accent="info">
          open
        </Hint>
      ) : null}
      <Hint k="?">help</Hint>
      <Hint k="q" accent="destructive">
        quit
      </Hint>
    </HintBar>
  );
}
