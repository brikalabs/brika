/**
 * End-to-end coverage for the key system: `useShortcut`, the input-
 * capture refcount, and the `<KeyScope>` opt-back-in. Locks down the
 * four invariants that bit the CLI when they regressed:
 *
 *   1. A plain `useShortcut` fires on its spec.
 *   2. A shell-level `useShortcut` auto-suspends while an `<Input>` /
 *      `<Confirm>` / `<Form>` has bumped the capture counter.
 *   3. Suspension reverses the moment capture releases.
 *   4. A `useShortcut` inside `<KeyScope>` keeps firing during capture.
 */

import { describe, expect, mock, test } from 'bun:test';
import { flush, waitFor } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { TuiShellProvider, useCaptureInput } from '../shell';
import { KeyScope } from './KeyScope';
import { useShortcut } from './useShortcut';

function Bind({
  spec,
  on,
  enabled,
}: Readonly<{ spec: string; on: () => void; enabled?: boolean }>): React.ReactElement {
  useShortcut(spec, on, enabled);
  return React.createElement(Text, null, '.');
}

function Capturer({ active }: Readonly<{ active: boolean }>): React.ReactElement {
  useCaptureInput(active);
  return React.createElement(Text, null, '.');
}

function withShell(tree: React.ReactNode): React.ReactElement {
  return React.createElement(TuiShellProvider, { onQuit: () => undefined }, tree);
}

describe('useShortcut', () => {
  test('fires when the spec matches', async () => {
    const onQ = mock();
    const { stdin, unmount } = render(withShell(React.createElement(Bind, { spec: 'q', on: onQ })));
    await flush();
    stdin.write('q');
    await waitFor(() => onQ.mock.calls.length >= 1);
    expect(onQ).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('does not fire on a different key', async () => {
    const onQ = mock();
    const { stdin, unmount } = render(withShell(React.createElement(Bind, { spec: 'q', on: onQ })));
    await flush();
    stdin.write('x');
    await flush();
    expect(onQ).not.toHaveBeenCalled();
    unmount();
  });

  test('does not fire when `enabled` is false', async () => {
    const onQ = mock();
    const { stdin, unmount } = render(
      withShell(React.createElement(Bind, { spec: 'q', on: onQ, enabled: false }))
    );
    await flush();
    stdin.write('q');
    await flush();
    expect(onQ).not.toHaveBeenCalled();
    unmount();
  });

  test('auto-suspends while another component holds the capture counter', async () => {
    const onQ = mock();
    const tree = withShell(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Capturer, { active: true }),
        React.createElement(Bind, { spec: 'q', on: onQ })
      )
    );
    const { stdin, unmount } = render(tree);
    await flush();
    stdin.write('q');
    await flush();
    expect(onQ).not.toHaveBeenCalled();
    unmount();
  });

  test('resumes firing as soon as capture releases', async () => {
    const onQ = mock();
    type Setter = (next: boolean) => void;
    const setterRef: { current: Setter | null } = { current: null };
    function Harness(): React.ReactElement {
      const [active, set] = React.useState(true);
      setterRef.current = set;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(Capturer, { active }),
        React.createElement(Bind, { spec: 'q', on: onQ })
      );
    }
    const { stdin, unmount } = render(withShell(React.createElement(Harness)));
    await flush();
    stdin.write('q');
    await flush();
    expect(onQ).not.toHaveBeenCalled();
    // Release capture. The state update flips `isInputCaptured` →
    // false via a React commit + capture-counter effect; under heavy
    // parallel-test load that pipeline can take more than the fixed
    // 250ms `flush()`. We retry the write until the bind has
    // observed the release (or the poll times out).
    setterRef.current?.(false);
    // Retry the write each tick until the bind has observed the release.
    await waitFor(() => {
      stdin.write('q');
      return onQ.mock.calls.length > 0;
    });
    expect(onQ).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('<KeyScope> opts a bind back in to firing during capture', async () => {
    const onQ = mock();
    const tree = withShell(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Capturer, { active: true }),
        React.createElement(KeyScope, null, React.createElement(Bind, { spec: 'q', on: onQ }))
      )
    );
    const { stdin, unmount } = render(tree);
    await flush();
    stdin.write('q');
    await flush();
    expect(onQ).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('multiple binds on the same key all fire (parallel useInput)', async () => {
    const onA = mock();
    const onB = mock();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Bind, { spec: 'q', on: onA }),
          React.createElement(Bind, { spec: 'q', on: onB })
        )
      )
    );
    await flush();
    stdin.write('q');
    await flush();
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);
    unmount();
  });
});
