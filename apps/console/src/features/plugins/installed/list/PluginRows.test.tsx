/**
 * Unit tests for `<PluginRows>` — covers the three render branches:
 *
 *   - `allCount === 0` → the "No plugins yet" empty state.
 *   - `allCount > 0 && items.length === 0` → the "Filter matches
 *     nothing" empty state.
 *   - rows present → status badges, focused-row cursor / boldness.
 */

import { describe, expect, test } from 'bun:test';
import { TuiShellProvider } from '@brika/tui';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../../../../_test-helpers';
import type { PluginListItem } from '../../../../shared/cli/api/plugins';
import { PluginRows } from './PluginRows';

function withShell(tree: React.ReactNode): React.ReactElement {
  return React.createElement(TuiShellProvider, { onQuit: () => undefined }, tree);
}

const sample: ReadonlyArray<PluginListItem> = [
  {
    uid: 'one',
    name: '@brika/one',
    displayName: 'One Plugin',
    version: '1.0.0',
    status: 'running',
    pid: 11,
  },
  {
    uid: 'two',
    name: '@brika/two',
    displayName: null,
    version: '0.2.0',
    status: 'stopped',
    pid: null,
  },
];

describe('<PluginRows>', () => {
  test('shows the empty-state message when there are no plugins at all', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(PluginRows, {
          items: [],
          allCount: 0,
          focusedUid: null,
          onFocusChange: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No plugins yet');
    expect(frame).toContain('Search');
    unmount();
  });

  test('shows the filter-empty message when allCount>0 but items is empty', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(PluginRows, {
          items: [],
          allCount: 4,
          focusedUid: null,
          onFocusChange: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Filter matches nothing');
    unmount();
  });

  test('renders each plugin with version + status badge', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(PluginRows, {
          items: sample,
          allCount: sample.length,
          focusedUid: 'one',
          onFocusChange: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    // Display name (or `name` when null) shows up for each row.
    expect(frame).toContain('One Plugin');
    expect(frame).toContain('@brika/two');
    // Versions and statuses are visible.
    expect(frame).toContain('v1.0.0');
    expect(frame).toContain('v0.2.0');
    expect(frame).toContain('running');
    expect(frame).toContain('stopped');
    unmount();
  });

  test('focused row gets the cursor glyph', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(PluginRows, {
          items: sample,
          allCount: sample.length,
          // `'one'` is the first row in `sample`; List auto-focuses
          // it on mount, so the cursor glyph lands next to it.
          focusedUid: 'one',
          onFocusChange: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    // The `<List>` component renders `▸` next to the focused row.
    expect(frame).toMatch(/▸/);
    // Spot-check that the cursor sits on the focused row's neighbourhood.
    const cursorLineMatch = /▸[^\n]*/.exec(frame);
    expect(cursorLineMatch?.[0]).toMatch(/One Plugin/);
    unmount();
  });
});
