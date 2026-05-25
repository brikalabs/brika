/**
 * Hook tests for `useGameInput`, `useGameLoop`, and `useGameSounds`.
 * The probe pattern matches `useReadme.test.tsx`: a stub component
 * binds the hook, the parent test rerenders / writes to stdin and
 * asserts on the captured dispatch calls.
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { flush, waitFor } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { useGameInput, useGameLoop, useGameSounds } from './hooks';
import { makeInitial } from './initial';
import type { Action, GameState } from './state';

interface InputProbeProps {
  readonly dispatch: (action: Action) => void;
}

function InputProbe({ dispatch }: Readonly<InputProbeProps>): React.ReactElement {
  useGameInput(dispatch);
  return React.createElement(Text, null, '.');
}

interface LoopProbeProps {
  readonly dispatch: (action: Action) => void;
}

function LoopProbe({ dispatch }: Readonly<LoopProbeProps>): React.ReactElement {
  useGameLoop(dispatch);
  return React.createElement(Text, null, '.');
}

interface SoundsProbeProps {
  readonly state: GameState;
}

function SoundsProbe({ state }: Readonly<SoundsProbeProps>): React.ReactElement {
  useGameSounds(state);
  return React.createElement(Text, null, '.');
}

const WORLD_W = 60;
const WORLD_H = 11;

describe('useGameInput', () => {
  test('dispatches jump on Space', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write(' ');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'jump' });
    unmount();
  });

  test('dispatches jump on ↑', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('[A');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'jump' });
    unmount();
  });

  test('dispatches crouch on ↓', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('[B');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'crouch' });
    unmount();
  });

  test('dispatches crouch on s', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('s');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'crouch' });
    unmount();
  });

  test('dispatches moveLeft on ← and on a', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('[D');
    await flush();
    stdin.write('a');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'moveLeft' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    unmount();
  });

  test('dispatches moveRight on → and on d', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('[C');
    await flush();
    stdin.write('d');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'moveRight' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    unmount();
  });

  test('dispatches pause on p and reset on r', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('p');
    await flush();
    stdin.write('r');
    await flush();
    expect(dispatch).toHaveBeenCalledWith({ type: 'pause' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'reset' });
    unmount();
  });

  test('ignores unrelated keys', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { stdin, unmount } = render(React.createElement(InputProbe, { dispatch }));
    await flush();
    stdin.write('z');
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
    unmount();
  });
});

describe('useGameLoop', () => {
  test('fires tick actions repeatedly while mounted', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { unmount } = render(React.createElement(LoopProbe, { dispatch }));
    // 30 Hz target → ~33 ms per tick. Poll until enough ticks have landed
    // rather than burning a fixed 250 ms.
    await waitFor(() => dispatch.mock.calls.length >= 3);
    unmount();

    expect(dispatch.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of dispatch.mock.calls) {
      const action = call[0];
      expect(action.type).toBe('tick');
      if (action.type === 'tick') {
        expect(typeof action.dtMs).toBe('number');
        expect(action.dtMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('clears the interval on unmount (no further dispatches)', async () => {
    const dispatch = mock<(action: Action) => void>();
    const { unmount } = render(React.createElement(LoopProbe, { dispatch }));
    await flush(80);
    unmount();
    const callsAtUnmount = dispatch.mock.calls.length;
    await flush(120);
    expect(dispatch.mock.calls.length).toBe(callsAtUnmount);
  });
});

type WriteSpy = ReturnType<typeof spyOn<typeof process.stdout, 'write'>>;

function beepFired(spy: WriteSpy): boolean {
  return spy.mock.calls.some((args) => args[0] === '\x07');
}

describe('useGameSounds', () => {
  let writeSpy: WriteSpy;
  let isTTYDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      get: () => true,
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
    if (isTTYDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', isTTYDescriptor);
    } else {
      Reflect.deleteProperty(process.stdout, 'isTTY');
    }
  });

  test('beeps when the run transitions from running to over', async () => {
    const initial = makeInitial(0, WORLD_W, WORLD_H);
    const running: GameState = { ...initial, status: 'running' };
    const { rerender, unmount } = render(React.createElement(SoundsProbe, { state: running }));
    await flush();
    writeSpy.mockClear();

    const over: GameState = { ...running, status: 'over' };
    rerender(React.createElement(SoundsProbe, { state: over }));
    await flush();
    expect(beepFired(writeSpy)).toBe(true);
    unmount();
  });

  test('beeps when Brix leaves the ground mid-run', async () => {
    const initial = makeInitial(0, WORLD_W, WORLD_H);
    const grounded: GameState = { ...initial, status: 'running' };
    const { rerender, unmount } = render(React.createElement(SoundsProbe, { state: grounded }));
    await flush();
    writeSpy.mockClear();

    const airborne: GameState = {
      ...grounded,
      brix: { ...grounded.brix, grounded: false, vy: 10 },
    };
    rerender(React.createElement(SoundsProbe, { state: airborne }));
    await flush();
    expect(beepFired(writeSpy)).toBe(true);
    unmount();
  });

  test('does not beep on a plain status-change rerender (no jump, no death)', async () => {
    const initial = makeInitial(0, WORLD_W, WORLD_H);
    const { rerender, unmount } = render(React.createElement(SoundsProbe, { state: initial }));
    await flush();
    writeSpy.mockClear();

    const paused: GameState = { ...initial, status: 'paused' };
    rerender(React.createElement(SoundsProbe, { state: paused }));
    await flush();
    expect(beepFired(writeSpy)).toBe(false);
    unmount();
  });
});
