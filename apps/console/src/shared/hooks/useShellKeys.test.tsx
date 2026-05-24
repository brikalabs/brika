/**
 * End-to-end coverage for the global shell key bindings registered by
 * `useShellKeys`. Wraps a no-op `<GlobalKeys>` component inside the
 * same `<RouterProvider>` + `<TuiShellProvider>` shell as the real
 * app, then asserts each binding triggers the expected router action.
 */

import { describe, expect, mock, test } from 'bun:test';
import {
  createRouter,
  defineRoute,
  RouterProvider,
  type RoutesShape,
  TuiShellProvider,
} from '@brika/tui';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../../_test-helpers';
import { useShellKeys } from './useShellKeys';

// Mirror the production route table closely enough for the section
// hotkeys to map to real keys. `NAV_SECTIONS` is the source of truth
// — these routes have to exist for the section-hotkey bindings to
// resolve to valid `router.navigate` targets.
const Stub: React.ComponentType = () => null;
const routes = {
  dashboard: defineRoute({ component: Stub }),
  plugins: defineRoute({ component: Stub }),
  workflows: defineRoute({ component: Stub }),
  logs: defineRoute({ component: Stub }),
  users: defineRoute({ component: Stub }),
  updates: defineRoute({ component: Stub }),
  settings: defineRoute({ component: Stub }),
  brix: defineRoute({ component: Stub }),
  help: defineRoute({ component: Stub }),
} as const satisfies RoutesShape;

function GlobalKeys(): null {
  useShellKeys();
  return null;
}

interface WrapProps {
  readonly onQuit: () => void;
  readonly router: ReturnType<typeof createRouter<typeof routes>>;
}

function Wrap({ onQuit, router }: Readonly<WrapProps>): React.ReactElement {
  return React.createElement(
    RouterProvider<typeof routes>,
    { router },
    React.createElement(TuiShellProvider, { onQuit }, React.createElement(GlobalKeys))
  );
}

describe('useShellKeys', () => {
  test('pressing `q` calls the shell-level onQuit handler', async () => {
    const onQuit = mock();
    const router = createRouter({ routes, initial: { name: 'dashboard' } });
    const { stdin, unmount } = render(React.createElement(Wrap, { onQuit, router }));
    await flush();
    stdin.write('q');
    await flush();
    expect(onQuit).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('`?` navigates to the help route', async () => {
    const router = createRouter({ routes, initial: { name: 'dashboard' } });
    const { stdin, unmount } = render(
      React.createElement(Wrap, { onQuit: () => undefined, router })
    );
    await flush();
    stdin.write('?');
    await flush();
    expect(router.current.name).toBe('help');
    unmount();
  });

  test('numeric section hotkeys jump straight to the matching route', async () => {
    const router = createRouter({ routes, initial: { name: 'dashboard' } });
    const { stdin, unmount } = render(
      React.createElement(Wrap, { onQuit: () => undefined, router })
    );
    await flush();
    // `2` is the plugins section hotkey per NAV_SECTIONS.
    stdin.write('2');
    await flush();
    expect(router.current.name).toBe('plugins');
    // `4` jumps to logs.
    stdin.write('4');
    await flush();
    expect(router.current.name).toBe('logs');
    unmount();
  });

  test('`]` advances to the next section in order; `[` walks back', async () => {
    const router = createRouter({ routes, initial: { name: 'dashboard' } });
    const { stdin, unmount } = render(
      React.createElement(Wrap, { onQuit: () => undefined, router })
    );
    await flush();
    // NAV_SECTIONS starts at dashboard; `]` cycles to plugins (next).
    stdin.write(']');
    await flush();
    expect(router.current.name).toBe('plugins');
    // `[` walks back to dashboard.
    stdin.write('[');
    await flush();
    expect(router.current.name).toBe('dashboard');
    unmount();
  });

  test('`[` from dashboard wraps to the last section in the list', async () => {
    const router = createRouter({ routes, initial: { name: 'dashboard' } });
    const { stdin, unmount } = render(
      React.createElement(Wrap, { onQuit: () => undefined, router })
    );
    await flush();
    stdin.write('[');
    await flush();
    // Last entry in NAV_SECTIONS is `settings` (brix is hidden behind
    // the mascot's rapid-click easter egg, intentionally absent here).
    expect(router.current.name).toBe('settings');
    unmount();
  });
});
