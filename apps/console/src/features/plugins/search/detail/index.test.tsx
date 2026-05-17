/**
 * Unit tests for the registry-detail panel.
 *
 *   - `<RegistryStatusBadge>` returns the right variant for each
 *     compatible/incompatible/installed/installing combination.
 *   - `<RegistryReadme>` renders the loading / error / source-present
 *     / empty branches.
 *   - `<RegistryDetail>` renders the package metadata block (name,
 *     version, source, downloads) and an Install button when the
 *     plugin is compatible and not already installed.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { TuiShellProvider } from '@brika/tui';
import { render } from 'ink-testing-library';
import React from 'react';
import type { RegistrySearchResult } from '../../../../shared/cli/api/registry';
import { RegistryDetail, RegistryReadme, RegistryStatusBadge } from './index';

function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withShell(tree: React.ReactNode): React.ReactElement {
  return React.createElement(TuiShellProvider, { onQuit: () => undefined }, tree);
}

const baseResult: RegistrySearchResult = {
  name: '@brika/demo',
  version: '1.0.0',
  displayName: 'Demo Plugin',
  description: 'A small registry sample plugin',
  installed: false,
  compatible: true,
  downloadCount: 1234,
  source: 'npm',
};

describe('<RegistryStatusBadge>', () => {
  test('shows `installed` when the package is installed', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryStatusBadge, {
        installed: true,
        installing: false,
        compatible: true,
      })
    );
    await flush(30);
    expect(lastFrame() ?? '').toContain('installed');
    unmount();
  });

  test('shows `installing` while in flight', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryStatusBadge, {
        installed: false,
        installing: true,
        compatible: true,
      })
    );
    await flush(30);
    expect(lastFrame() ?? '').toContain('installing');
    unmount();
  });

  test('shows `incompatible` when the package fails the compatibility gate', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryStatusBadge, {
        installed: false,
        installing: false,
        compatible: false,
      })
    );
    await flush(30);
    expect(lastFrame() ?? '').toContain('incompatible');
    unmount();
  });

  test('shows `available` for a fresh, compatible package', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryStatusBadge, {
        installed: false,
        installing: false,
        compatible: true,
      })
    );
    await flush(30);
    expect(lastFrame() ?? '').toContain('available');
    unmount();
  });
});

describe('<RegistryReadme>', () => {
  test('renders the loading placeholder', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryReadme, {
        loading: true,
        error: null,
        source: null,
        packageName: 'demo',
      })
    );
    await flush(30);
    expect(lastFrame() ?? '').toContain('loading readme');
    unmount();
  });

  test('renders the error branch with the message', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryReadme, {
        loading: false,
        error: 'boom',
        source: null,
        packageName: 'demo',
      })
    );
    await flush(30);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('readme');
    expect(frame).toContain('boom');
    unmount();
  });

  test('renders the empty-state message when no readme is bundled', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(RegistryReadme, {
        loading: false,
        error: null,
        source: '',
        packageName: 'demo',
      })
    );
    await flush(30);
    expect(lastFrame() ?? '').toContain('no readme');
    unmount();
  });

  test('renders the markdown source inside a ScrollArea when present', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(RegistryReadme, {
          loading: false,
          error: null,
          source: '# Hello there\n\nA short readme body.',
          packageName: 'demo',
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    // ScrollArea defaults to a small viewport in tests (~1 visible
    // line); the heading lands at the top. Body is visible via the
    // scroll-hint footer's `1–1 / N` indicator.
    expect(frame).toContain('Hello there');
    expect(frame).toMatch(/scroll/);
    unmount();
  });
});

describe('<RegistryDetail>', () => {
  const bun = useBunMock();

  beforeEach(() => {
    // Stub the readme endpoint with a recognisable body so we can
    // assert it appears in the rendered frame after the fetch settles.
    bun.fetch(async () => {
      return new Response(JSON.stringify({ readme: '# Detail README' }), { status: 200 });
    });
  });

  test('renders the package header, properties, and Install button', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(RegistryDetail, {
          item: baseResult,
          installed: false,
          installing: false,
          progress: null,
          error: null,
          onInstall: () => undefined,
          onBack: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    // Title block.
    expect(frame).toContain('Demo Plugin');
    expect(frame).toContain('v1.0.0');
    expect(frame).toContain('available');
    // Properties block.
    expect(frame).toContain('package');
    expect(frame).toContain('@brika/demo');
    expect(frame).toContain('source');
    expect(frame).toContain('npm');
    expect(frame).toContain('downloads');
    expect(frame).toContain('1,234');
    // Description.
    expect(frame).toContain('A small registry sample plugin');
    // Buttons.
    expect(frame).toContain('back');
    expect(frame).toContain('install');
    unmount();
  });

  test('hides the Install button when the package is already installed', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(RegistryDetail, {
          item: { ...baseResult, installed: true },
          installed: true,
          installing: false,
          progress: null,
          error: null,
          onInstall: () => undefined,
          onBack: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('installed');
    expect(frame).toContain('back');
    expect(frame).not.toContain('install ');
    unmount();
  });

  test('shows the install-progress line while installing', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(RegistryDetail, {
          item: baseResult,
          installed: false,
          installing: true,
          progress: { phase: 'downloading', message: 'tarball' },
          error: null,
          onInstall: () => undefined,
          onBack: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('downloading');
    expect(frame).toContain('tarball');
    unmount();
  });

  test('renders an error footer when the install attempt failed', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(RegistryDetail, {
          item: baseResult,
          installed: false,
          installing: false,
          progress: null,
          error: 'install failed: 500',
          onInstall: () => undefined,
          onBack: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('install failed: 500');
    unmount();
  });

  test('renders the incompatible badge + reason for an incompatible package', async () => {
    const { lastFrame, unmount } = render(
      withShell(
        React.createElement(RegistryDetail, {
          item: {
            ...baseResult,
            compatible: false,
            compatibilityReason: 'requires brika ≥2.0',
          },
          installed: false,
          installing: false,
          progress: null,
          error: null,
          onInstall: () => undefined,
          onBack: () => undefined,
        })
      )
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('incompatible');
    expect(frame).toContain('requires brika');
    unmount();
  });
});
