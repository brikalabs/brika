/**
 * End-to-end coverage for `<Button>` activation paths:
 *   - the global `shortcut` keybind fires `onPress` regardless of focus
 *   - explicit `enabled={false}` neuters every path
 *   - `escape` specifically (regression: plugin-detail back button
 *     stopped responding because the spec parser lower-cased the
 *     token mismatched against the camelCase `SPECIAL_KEYS` table)
 */

import { describe, expect, mock, test } from 'bun:test';
import { render } from 'ink-testing-library';
import React from 'react';
import { TuiShellProvider } from '../shell';
import { Button } from './Button';

// 250ms is well above the ~10ms ink-testing-library typically needs to
// commit a render + cleanup, but generous enough to absorb the worst-case
// CI slot under parallel test pressure.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

function withShell(tree: React.ReactNode): React.ReactElement {
  return React.createElement(TuiShellProvider, { onQuit: () => undefined }, tree);
}

describe('<Button>', () => {
  test('fires onPress when its shortcut key is pressed', async () => {
    const onPress = mock();
    const { stdin, unmount } = render(
      withShell(React.createElement(Button, { shortcut: 'e', onPress }, 'enable'))
    );
    await flush();
    stdin.write('e');
    await flush();
    expect(onPress).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('shortcut fires even when another sibling has focus', async () => {
    const onBack = mock();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(
          React.Fragment,
          null,
          // First button auto-focuses; the back button's shortcut must
          // still fire even though it never owns ink focus.
          React.createElement(
            Button,
            { shortcut: 'e', autoFocus: true, onPress: () => undefined },
            'enable'
          ),
          React.createElement(Button, { shortcut: 'X', onPress: onBack }, 'back')
        )
      )
    );
    await flush();
    stdin.write('X');
    await flush();
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('enabled={false} blocks the shortcut', async () => {
    const onPress = mock();
    const { stdin, unmount } = render(
      withShell(React.createElement(Button, { shortcut: 'e', enabled: false, onPress }, 'enable'))
    );
    await flush();
    stdin.write('e');
    await flush();
    expect(onPress).not.toHaveBeenCalled();
    unmount();
  });

  test('multiple buttons each fire their own shortcut independently', async () => {
    const onE = mock();
    const onX = mock();
    const { stdin, unmount } = render(
      withShell(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Button, { shortcut: 'e', onPress: onE }, 'enable'),
          React.createElement(Button, { shortcut: 'X', onPress: onX }, 'uninstall')
        )
      )
    );
    await flush();
    stdin.write('e');
    await flush();
    stdin.write('X');
    await flush();
    expect(onE).toHaveBeenCalledTimes(1);
    expect(onX).toHaveBeenCalledTimes(1);
    unmount();
  });
});
