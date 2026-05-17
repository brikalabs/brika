/** React glue for the game: keyboard → dispatch, 30 Hz tick driver. */

import { useInput } from 'ink';
import type { Dispatch } from 'react';
import { useEffect, useRef } from 'react';
import { TICK_MS } from './constants';
import type { Action, GameState } from './state';

export function useGameInput(dispatch: Dispatch<Action>): void {
  useInput((input, key) => {
    if (input === ' ' || key.upArrow) {
      return dispatch({ type: 'jump' });
    }
    if (key.downArrow || input === 's') {
      return dispatch({ type: 'crouch' });
    }
    if (key.leftArrow || input === 'a') {
      return dispatch({ type: 'moveLeft' });
    }
    if (key.rightArrow || input === 'd') {
      return dispatch({ type: 'moveRight' });
    }
    if (input === 'p') {
      return dispatch({ type: 'pause' });
    }
    if (input === 'r') {
      dispatch({ type: 'reset' });
    }
  });
}

export function useGameLoop(dispatch: Dispatch<Action>): void {
  const last = useRef<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      dispatch({ type: 'tick', dtMs: now - last.current });
      last.current = now;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [dispatch]);
}

export function useGameSounds(state: GameState): void {
  const prevGrounded = useRef(state.brix.grounded);
  const prevStatus = useRef(state.status);
  useEffect(() => {
    const jumped = state.status === 'running' && prevGrounded.current && !state.brix.grounded;
    const died = prevStatus.current === 'running' && state.status === 'over';
    if ((died || jumped) && process.stdout.isTTY) {
      process.stdout.write('\x07');
    }
    prevGrounded.current = state.brix.grounded;
    prevStatus.current = state.status;
  }, [state.brix.grounded, state.status]);
}
