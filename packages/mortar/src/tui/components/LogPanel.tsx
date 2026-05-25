/**
 * Mortar's focusable wrapper around `<LogPane>`.
 *
 * `<LogPane>` is a pure presentational component in `@brika/tui` — it
 * doesn't claim a focus slot. We add the slot here so the log pane
 * participates in Tab cycling alongside the service list and so the
 * border can switch to the bold/cyan "focused" treatment.
 *
 * Scroll keybinds also live here, gated on focus: `↑` / `↓` / `PgUp`
 * etc. only scroll the buffer while this panel actually owns focus.
 * That's what keeps the same keys free to navigate the service list
 * when focus is over there.
 */

import { LogPane, useFocusable } from '@brika/tui';
import { type DOMElement } from 'ink';
import type React from 'react';
import { useRef } from 'react';
import type { ServiceState } from '../../supervisor';
import { useScrollKeys } from '../keys/useScrollKeys';
import { useMortar } from '../useMortar';

interface Props {
  readonly focused: ServiceState;
  readonly visible: number;
  readonly scrollFromBottom: number | null;
  readonly maxScroll: number;
  readonly searchQuery: string;
  readonly currentMatchLine: number | null;
}

export function LogPanel({
  focused,
  visible,
  scrollFromBottom,
  maxScroll,
  searchQuery,
  currentMatchLine,
}: Readonly<Props>): React.ReactElement {
  const { search } = useMortar();
  const ref = useRef<DOMElement>(null);
  const { isFocused } = useFocusable({ id: 'mortar-log-pane', ref });
  // Scroll only when this panel actually owns focus AND search isn't
  // capturing keystrokes — otherwise `↑` / `↓` would fight with list
  // navigation or with the search input prompt.
  useScrollKeys(isFocused && search.mode === 'normal');

  return (
    <LogPane
      outerRef={ref}
      label={focused.spec.label}
      lines={focused.logs}
      revision={focused.revision}
      status={focused.status}
      visible={visible}
      scrollFromBottom={scrollFromBottom}
      maxScroll={maxScroll}
      searchQuery={searchQuery}
      currentMatchLine={currentMatchLine}
      focused={isFocused}
    />
  );
}
