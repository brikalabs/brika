/**
 * Unit tests for `<FilterDraft>` — the local-state wrapper around
 * `<Input>` used by the Installed Plugins filter prompt.
 *
 * Covers the contract the parent depends on:
 *   - the initial value seeds the visible draft.
 *   - Enter calls `onCommit` with whatever the user typed.
 *   - Esc calls `onCancel`.
 *
 * `<Input>` uses ink's `useInput`, and ink's parser maps `\r` to
 * Enter and `\x1b` to Escape — so we don't need any custom key
 * encoding to drive the component.
 */

import { describe, expect, mock, test } from 'bun:test';
import { flush, waitFor } from '@brika/testing';
import { TuiShellProvider } from '@brika/tui';
import { render } from 'ink-testing-library';
import React from 'react';
import { FilterDraft } from './FilterDraft';

function withShell(tree: React.ReactNode): React.ReactElement {
  return React.createElement(TuiShellProvider, { onQuit: () => undefined }, tree);
}

describe('<FilterDraft>', () => {
  test('renders the input with the initial value visible', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(FilterDraft, {
          initial: 'acme',
          onCommit: () => undefined,
          onCancel: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('acme');
    unmount();
  });

  test('Enter commits the current draft value', async () => {
    const onCommit = mock<(v: string) => void>();
    const onCancel = mock<() => void>();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(FilterDraft, {
          initial: 'foo',
          onCommit,
          onCancel,
        })
      )
    );
    await flush();
    // `\r` is parsed as Enter by ink's keypress parser.
    stdin.write('\r');
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('foo');
    expect(onCancel).not.toHaveBeenCalled();
    unmount();
  });

  test('typed input is appended to the draft before Enter commits it', async () => {
    const onCommit = mock<(v: string) => void>();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(FilterDraft, {
          initial: '',
          onCommit,
          onCancel: () => undefined,
        })
      )
    );
    await flush();
    // Flush after each printable so the Input commits the new draft
    // back through `setState` before the next keystroke's `value`
    // capture reads the old prop.
    stdin.write('a');
    await flush(30);
    stdin.write('b');
    await flush(30);
    stdin.write('\r');
    await flush();
    expect(onCommit).toHaveBeenLastCalledWith('ab');
    unmount();
  });

  test('Esc fires onCancel and does not commit', async () => {
    const onCommit = mock<(v: string) => void>();
    const onCancel = mock<() => void>();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(FilterDraft, {
          initial: 'partial',
          onCommit,
          onCancel,
        })
      )
    );
    await flush();
    // `\x1b` is parsed as Escape.
    stdin.write('\x1b');
    await waitFor(() => onCancel.mock.calls.length > 0);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
  });
});
