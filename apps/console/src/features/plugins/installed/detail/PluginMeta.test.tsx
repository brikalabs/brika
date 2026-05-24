/**
 * Unit tests for `<PluginMeta>` — the metadata + live runtime stats
 * panel for the focused plugin.
 *
 * Verifies:
 *   - Renders version + author + pid for a basic plugin.
 *   - Hides cpu / memory rows when `metrics === null`.
 *   - Surfaces cpu / memory rows from `metrics.current`.
 *   - Accepts both `string` and `{ name }` author shapes.
 *   - Accepts both `string` and `{ url }` repository shapes.
 */

import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../../../../_test-helpers';
import type { PluginListItem, PluginMetrics } from '../../../../shared/cli/api/plugins';
import { CpuBadge, cpuVariant, formatBytes, PluginMeta } from './PluginMeta';

const base: PluginListItem = {
  uid: 'uid-1',
  name: '@brika/sample',
  displayName: 'Sample',
  version: '1.2.3',
  status: 'running',
  pid: 999,
};

describe('<PluginMeta>', () => {
  test('renders version + author + pid when metrics is null', async () => {
    const plugin: PluginListItem = {
      ...base,
      author: 'Jane',
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin, metrics: null })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('version');
    expect(frame).toContain('1.2.3');
    expect(frame).toContain('author');
    expect(frame).toContain('Jane');
    expect(frame).toContain('pid');
    expect(frame).toContain('999');
    // No cpu / memory rows without metrics.
    expect(frame).not.toContain('cpu');
    expect(frame).not.toContain('memory');
    unmount();
  });

  test('renders cpu + memory rows when metrics.current is present', async () => {
    const metrics: PluginMetrics = {
      pid: 999,
      current: { cpu: 12.5, memory: 1024 * 1024 * 8 },
      history: [],
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin: base, metrics })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('cpu');
    expect(frame).toContain('12.5%');
    expect(frame).toContain('memory');
    expect(frame).toContain('8.0 MB');
    unmount();
  });

  test('handles object-shaped author { name } and repository { url }', async () => {
    const plugin: PluginListItem = {
      ...base,
      author: { name: 'Acme Co.' },
      repository: { url: 'https://example.com/repo' },
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin, metrics: null })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Acme Co.');
    expect(frame).toContain('repo');
    expect(frame).toContain('https://example.com/repo');
    unmount();
  });

  test('handles string-shaped repository', async () => {
    const plugin: PluginListItem = {
      ...base,
      repository: 'https://example.com/plain-string-repo',
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin, metrics: null })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('https://example.com/plain-string-repo');
    unmount();
  });

  test('omits the repo row when it duplicates the homepage URL', async () => {
    const plugin: PluginListItem = {
      ...base,
      homepage: 'https://same.example/page',
      repository: 'https://same.example/page',
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin, metrics: null })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('homepage');
    expect(frame).toContain('https://same.example/page');
    // No second 'repo' row when the values are identical.
    expect(frame.includes('repo ')).toBe(false);
    unmount();
  });

  test('hides the pid row entirely when pid is null and the plugin is stopped', async () => {
    const plugin: PluginListItem = {
      ...base,
      status: 'stopped',
      pid: null,
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin, metrics: null })
    );
    await flush();
    const frame = lastFrame() ?? '';
    // The pid label only appears when the row renders. A stopped
    // plugin with no pid suppresses the row entirely.
    expect(frame).not.toContain('pid');
    unmount();
  });

  test('shows pid="—" when running but pid is unknown', async () => {
    const plugin: PluginListItem = {
      ...base,
      status: 'running',
      pid: null,
    };
    const { lastFrame, unmount } = render(
      React.createElement(PluginMeta, { plugin, metrics: null })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('pid');
    expect(frame).toContain('—');
    unmount();
  });
});

describe('cpuVariant', () => {
  test('maps cpu percent buckets to badge variants', () => {
    expect(cpuVariant(0)).toBe('secondary');
    expect(cpuVariant(39.9)).toBe('secondary');
    expect(cpuVariant(40)).toBe('warning');
    expect(cpuVariant(79.9)).toBe('warning');
    expect(cpuVariant(80)).toBe('destructive');
    expect(cpuVariant(100)).toBe('destructive');
  });
});

describe('<CpuBadge>', () => {
  test('renders the percent label with one decimal place', async () => {
    const { lastFrame, unmount } = render(React.createElement(CpuBadge, { percent: 42.42 }));
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('42.4%');
    unmount();
  });
});

describe('formatBytes', () => {
  test('reports raw bytes under 1KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  test('uses KB for the 1KB-1MB range', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  test('uses MB for the 1MB-1GB range', () => {
    expect(formatBytes(1024 * 1024 * 4)).toBe('4.0 MB');
  });

  test('uses GB beyond 1GB', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 3)).toBe('3.00 GB');
  });
});
