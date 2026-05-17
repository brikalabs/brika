/**
 * Unit tests for `useCompletionsInstall` — the phase machine that
 * `brika completions install` renders.
 *
 * Strategy: stub `$SHELL` and `os.homedir()` (the only inputs to the
 * real completions module) so writes land in a per-test tmpdir, and
 * mock `runCommandTui` to inject a recordable `useExit` without
 * mounting `useApp`. We avoid `mock.module` against the completions
 * module so as not to bleed into `shared/cli/completions.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import type { Command } from '@brika/cli';
import { defineCommand } from '@brika/cli';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';

const exitCallback = mock<(delayMs?: number) => void>(() => undefined);
const useExitMock = mock(() => exitCallback);

mock.module('../../runCommandTui', () => ({
  useExit: useExitMock,
}));

const completionsHookModule = await import('./useCompletionsInstall');
const { useCompletionsInstall } = completionsHookModule;
type Phase = ReturnType<typeof completionsHookModule.useCompletionsInstall>['phase'];

function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const COMMANDS: Command[] = [
  defineCommand({
    name: 'hub',
    description: 'Hub commands',
    handler: () => undefined,
  }),
];

function Probe({ onResult }: Readonly<{ onResult: (phase: Phase) => void }>): React.ReactElement {
  const { phase } = useCompletionsInstall(COMMANDS);
  onResult(phase);
  return React.createElement(Text, null, '.');
}

describe('useCompletionsInstall', () => {
  let fakeHome: string;
  let originalShell: string | undefined;
  let homedirSpy: ReturnType<typeof spyOn> | null = null;
  let mkdirSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(os.tmpdir(), 'brika-completions-hook-'));
    originalShell = process.env.SHELL;
    exitCallback.mockReset();
    useExitMock.mockClear();
  });

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
    homedirSpy?.mockRestore();
    mkdirSpy?.mockRestore();
    homedirSpy = null;
    mkdirSpy = null;
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('walks detecting → installing → installed when a shell is detected', async () => {
    process.env.SHELL = '/usr/local/bin/zsh';
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(fakeHome);

    const phases: Phase[] = [];
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (p) => phases.push(p),
      })
    );

    await flush(500);

    const final = phases.at(-1);
    expect(final?.kind).toBe('installed');
    if (final?.kind === 'installed') {
      expect(final.shell).toBe('zsh');
      expect(final.file).toContain(fakeHome);
    }
    expect(phases.some((p) => p.kind === 'detecting')).toBe(true);
    expect(phases.some((p) => p.kind === 'installing')).toBe(true);
    expect(exitCallback).toHaveBeenCalled();
    unmount();
  });

  test('transitions to noShell when $SHELL is unsupported', async () => {
    process.env.SHELL = '/bin/pwsh';
    const latest: { current: Phase | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (p) => {
          latest.current = p;
        },
      })
    );
    await flush(500);
    expect(latest.current?.kind).toBe('noShell');
    expect(exitCallback).toHaveBeenCalled();
    unmount();
  });

  test('transitions to error when the install throws', async () => {
    process.env.SHELL = '/bin/bash';
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(fakeHome);
    // `fsp.writeFile` is what `installCompletions` calls last; throwing
    // from it propagates out as the install error. (Spying on `mkdir`
    // would also work but its overload signatures make `mockImplementation`
    // hard to type without `any`.)
    mkdirSpy = spyOn(fsp, 'writeFile').mockImplementation(
      (): Promise<void> => Promise.reject(new Error('disk full'))
    );

    const latest: { current: Phase | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (p) => {
          latest.current = p;
        },
      })
    );
    await flush(500);
    expect(latest.current?.kind).toBe('error');
    if (latest.current?.kind === 'error') {
      expect(latest.current.message).toBe('disk full');
    }
    expect(exitCallback).toHaveBeenCalled();
    unmount();
  });
});
