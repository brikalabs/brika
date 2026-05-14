import { describe, expect, test } from 'bun:test';
import {
  type HostState,
  INITIAL_STATE,
  isFinished,
  type Reaction,
  reduce,
} from './brixHostReducer';

const WAVE: Reaction = { kind: 'wave', color: 'green', line: 'hi!' };

describe('reduce — HUB events', () => {
  test('transitions to reacting when given a reaction', () => {
    const out = reduce(INITIAL_STATE, { type: 'HUB', reaction: WAVE });
    expect(out.phase).toBe('reacting');
    expect(out.reaction).toBe('wave');
    expect(out.text).toBe('hi!');
    expect(out.revealed).toBe(0);
    expect(out.tint).toBe('green');
  });

  test('no-op for HUB with null reaction', () => {
    const out = reduce(INITIAL_STATE, { type: 'HUB', reaction: null });
    expect(out).toBe(INITIAL_STATE);
  });

  test('HUB during speaking interrupts and switches to reacting', () => {
    const speaking: HostState = {
      phase: 'speaking',
      text: 'hello there',
      revealed: 4,
      reaction: null,
      tint: 'cyan',
    };
    const out = reduce(speaking, { type: 'HUB', reaction: WAVE });
    expect(out.phase).toBe('reacting');
    expect(out.reaction).toBe('wave');
    expect(out.text).toBe('hi!');
    expect(out.revealed).toBe(0);
  });
});

describe('reduce — STATUS events', () => {
  test('starts a new speaking line', () => {
    const out = reduce(INITIAL_STATE, {
      type: 'STATUS',
      text: 'updating registry',
      tint: 'magenta',
    });
    expect(out.phase).toBe('speaking');
    expect(out.text).toBe('updating registry');
    expect(out.revealed).toBe(0);
    expect(out.tint).toBe('magenta');
  });

  test('ignores blank or whitespace-only text', () => {
    expect(reduce(INITIAL_STATE, { type: 'STATUS', text: '', tint: 'cyan' })).toBe(INITIAL_STATE);
    expect(reduce(INITIAL_STATE, { type: 'STATUS', text: '   ', tint: 'cyan' })).toBe(
      INITIAL_STATE
    );
  });

  test('interrupts a currently-playing reaction', () => {
    const reacting: HostState = {
      phase: 'reacting',
      text: 'hi!',
      revealed: 1,
      reaction: 'wave',
      tint: 'green',
    };
    const out = reduce(reacting, { type: 'STATUS', text: 'new line', tint: 'cyan' });
    expect(out.phase).toBe('speaking');
    expect(out.reaction).toBeNull();
    expect(out.text).toBe('new line');
  });
});

describe('reduce — IDLE_LINE events', () => {
  test('starts speaking when phase is idle', () => {
    const out = reduce(INITIAL_STATE, {
      type: 'IDLE_LINE',
      text: 'just chilling',
      tint: 'cyan',
    });
    expect(out.phase).toBe('speaking');
    expect(out.text).toBe('just chilling');
  });

  test('no-op when not idle (stale timer protection)', () => {
    const reacting: HostState = {
      phase: 'reacting',
      text: 'hi!',
      revealed: 0,
      reaction: 'wave',
      tint: 'green',
    };
    const out = reduce(reacting, {
      type: 'IDLE_LINE',
      text: 'late timer',
      tint: 'cyan',
    });
    expect(out).toBe(reacting);
  });

  test('no-op for blank idle line', () => {
    expect(reduce(INITIAL_STATE, { type: 'IDLE_LINE', text: '   ', tint: 'cyan' })).toBe(
      INITIAL_STATE
    );
  });
});

describe('reduce — REVEAL events', () => {
  test('increments revealed by 1 while typing', () => {
    const speaking: HostState = {
      phase: 'speaking',
      text: 'hello',
      revealed: 2,
      reaction: null,
      tint: 'cyan',
    };
    const out = reduce(speaking, { type: 'REVEAL' });
    expect(out.revealed).toBe(3);
  });

  test('no-op once fully revealed', () => {
    const done: HostState = {
      phase: 'speaking',
      text: 'hi',
      revealed: 2,
      reaction: null,
      tint: 'cyan',
    };
    expect(reduce(done, { type: 'REVEAL' })).toBe(done);
  });

  test('no-op while idle', () => {
    expect(reduce(INITIAL_STATE, { type: 'REVEAL' })).toBe(INITIAL_STATE);
  });
});

describe('reduce — HOLD_OVER events', () => {
  test('drops back to idle, preserving tint for a smooth transition', () => {
    const speaking: HostState = {
      phase: 'speaking',
      text: 'hello',
      revealed: 5,
      reaction: null,
      tint: 'magenta',
    };
    const out = reduce(speaking, { type: 'HOLD_OVER' });
    expect(out.phase).toBe('idle');
    expect(out.text).toBe('');
    expect(out.revealed).toBe(0);
    expect(out.reaction).toBeNull();
    expect(out.tint).toBe('magenta');
  });
});

describe('isFinished', () => {
  test('false while idle', () => {
    expect(isFinished(INITIAL_STATE)).toBe(false);
  });

  test('true once revealed has caught up to text length', () => {
    const done: HostState = {
      phase: 'speaking',
      text: 'hi',
      revealed: 2,
      reaction: null,
      tint: 'cyan',
    };
    expect(isFinished(done)).toBe(true);
  });

  test('false while still typing', () => {
    const typing: HostState = {
      phase: 'speaking',
      text: 'hello',
      revealed: 3,
      reaction: null,
      tint: 'cyan',
    };
    expect(isFinished(typing)).toBe(false);
  });
});
