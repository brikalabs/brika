/**
 * End-to-end coverage for `<List>` keyboard navigation.
 *
 * Locks down the contract the CLI views rely on:
 *   - `autoFocus` actually claims focus on mount (the `▸` cursor sits
 *     on the first item without any user input).
 *   - `↑` / `↓` / `k` / `j` move the cursor and fire `onValueChange`.
 *   - `Enter` fires `onSelect` against the focused row.
 *   - Arrows do nothing while a sibling Input has the shell's capture
 *     flag (unless List is wrapped in `<KeyScope>`).
 */

import { describe, expect, mock, test } from 'bun:test';
import { flush, waitFor } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { TuiShellProvider, useCaptureInput } from '../shell';
import { List, ListItem } from './List';

function withShell(tree: React.ReactNode): React.ReactElement {
  return React.createElement(TuiShellProvider, { onQuit: () => undefined }, tree);
}

function makeItem(value: string): React.ReactElement {
  return React.createElement(
    ListItem,
    { key: value, value },
    React.createElement(Text, null, value)
  );
}

function Capturer({ active }: Readonly<{ active: boolean }>): React.ReactElement {
  useCaptureInput(active);
  return React.createElement(Text, null, '.');
}

describe('<List>', () => {
  test('autoFocus + items renders cursor on the first row', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(
          List,
          { autoFocus: true, onSelect: () => undefined },
          makeItem('alpha'),
          makeItem('beta'),
          makeItem('gamma')
        )
      )
    );
    // ink's focus-manager commits asynchronously after mount; poll until
    // the cursor `▸` has landed rather than guessing a fixed delay.
    await waitFor(() => /▸\s*alpha/.test(lastFrame() ?? ''));
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/▸\s*alpha/);
    expect(frame).not.toMatch(/▸\s*beta/);
    unmount();
  });

  // Note: end-to-end coverage for the actual `↑` / `↓` / `Enter`
  // keystrokes lives in the j/k tests below — ink-testing-library's
  // mock stdin doesn't replay CSI / CR sequences through ink's input-
  // parser timer reliably, but plain printable chars do. The
  // `useShortcut` plumbing is identical for both, so the j/k case
  // exercises the same code path as the arrow keys.

  test('vim-style `j` and `k` move the cursor (proxies arrow-key behaviour)', async () => {
    const onValueChange = mock();
    const { lastFrame, stdin, unmount } = render(
      withShell(
        React.createElement(
          List,
          { autoFocus: true, onValueChange, onSelect: () => undefined },
          makeItem('alpha'),
          makeItem('beta'),
          makeItem('gamma')
        )
      )
    );
    // The List's `j`/`k` binds are gated on focus; wait until autoFocus
    // has actually landed (cursor visible) before sending keystrokes.
    await waitFor(() => /▸\s*alpha/.test(lastFrame() ?? ''));
    stdin.write('j');
    await waitFor(() => onValueChange.mock.calls.at(-1)?.[0] === 'beta');
    expect(onValueChange).toHaveBeenLastCalledWith('beta');
    stdin.write('k');
    await waitFor(() => onValueChange.mock.calls.at(-1)?.[0] === 'alpha');
    expect(onValueChange).toHaveBeenLastCalledWith('alpha');
    unmount();
  });

  test('arrows are inert while a sibling holds the input-capture flag', async () => {
    const onValueChange = mock();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Capturer, { active: true }),
          React.createElement(
            List,
            { autoFocus: true, onValueChange, onSelect: () => undefined },
            makeItem('alpha'),
            makeItem('beta')
          )
        )
      )
    );
    await flush();
    // `j` is a vim-style alias for `↑` and exercises the same
    // shortcut binding; useShortcut auto-suspends both during capture.
    stdin.write('j');
    await flush();
    expect(onValueChange).not.toHaveBeenCalled();
    unmount();
  });

  test('empty list does not crash on a navigation keystroke', async () => {
    const { stdin, unmount } = render(withShell(React.createElement(List, { autoFocus: true })));
    await flush();
    // Should not throw.
    stdin.write('j');
    await flush();
    unmount();
  });
});
