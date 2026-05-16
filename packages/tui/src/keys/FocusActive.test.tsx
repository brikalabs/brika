/**
 * Regression coverage for the "hidden tab panel steals focus" bug.
 *
 * `<TabsContent>` keeps inactive panels mounted with `display:'none'`,
 * so without `<FocusActive>` a hidden `<Input autoFocus>` would still
 * register with ink's focus manager and claim the active id before
 * the visible panel's primary focusable could. This file pins the
 * fix: descendants of `<FocusActive active={false}>` must not own
 * focus.
 */

import { describe, expect, test } from 'bun:test';
import { Text, useFocus } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { FocusActive, useFocusActive } from './FocusActive';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function Probe({ id, label }: Readonly<{ id: string; label: string }>): React.ReactElement {
  const containerActive = useFocusActive();
  const { isFocused } = useFocus({
    id,
    autoFocus: containerActive,
    isActive: containerActive,
  });
  return React.createElement(Text, null, `${label}:${isFocused ? 'F' : '-'}`);
}

describe('<FocusActive>', () => {
  test('descendants of an inactive container do not autoFocus', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          FocusActive,
          { active: false },
          React.createElement(Probe, { id: 'hidden', label: 'hidden' })
        ),
        React.createElement(
          FocusActive,
          { active: true },
          React.createElement(Probe, { id: 'visible', label: 'visible' })
        )
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    // Only the visible probe should be focused; hidden stays un-claimed
    // even though it would `autoFocus` if it could.
    expect(frame).toContain('visible:F');
    expect(frame).toContain('hidden:-');
    unmount();
  });

  test('nested providers AND together', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(
        FocusActive,
        { active: true },
        React.createElement(
          FocusActive,
          { active: false },
          React.createElement(Probe, { id: 'inner', label: 'inner' })
        )
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    // Outer is active, but the nested inactive wrapper wins — the inner
    // probe must NOT take focus.
    expect(frame).toContain('inner:-');
    unmount();
  });
});
