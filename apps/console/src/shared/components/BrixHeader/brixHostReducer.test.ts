import { describe, expect, test } from 'bun:test';
import {
  type HostState,
  INITIAL_STATE,
  isFinished,
  type Reaction,
  reduce,
  visibleText,
} from './brixHostReducer';

const WAVE: Reaction = { kind: 'wave', color: 'green', line: 'hi!' };
/** Compact pacing so test math stays readable. */
const PACING = { charMs: 10, wordPauseMs: 100, sentencePauseMs: 500, clausePauseMs: 200 };

describe('reduce — HUB events', () => {
  test('transitions to reacting and pre-computes the stream', () => {
    const out = reduce(INITIAL_STATE, { type: 'HUB', reaction: WAVE, pacing: PACING });
    expect(out.phase).toBe('reacting');
    expect(out.reaction).toBe('wave');
    expect(out.cursor).toBe(0);
    expect(out.tint).toBe('green');
    expect(out.stream).toHaveLength('hi!'.length);
  });

  test('no-op for HUB with null reaction', () => {
    const out = reduce(INITIAL_STATE, { type: 'HUB', reaction: null });
    expect(out).toBe(INITIAL_STATE);
  });

  test('HUB during speaking interrupts and resets the cursor', () => {
    const speaking: HostState = {
      phase: 'speaking',
      stream: [
        { mood: 'default', token: 'x', trailing: '', pauseMs: 10 },
        { mood: 'default', token: 'y', trailing: '', pauseMs: 10 },
      ],
      cursor: 1,
      reaction: null,
      tint: 'cyan',
    };
    const out = reduce(speaking, { type: 'HUB', reaction: WAVE, pacing: PACING });
    expect(out.phase).toBe('reacting');
    expect(out.reaction).toBe('wave');
    expect(out.cursor).toBe(0);
  });
});

describe('reduce — STATUS events', () => {
  test('starts a new speaking line with a per-step stream', () => {
    const out = reduce(INITIAL_STATE, {
      type: 'STATUS',
      text: 'hi yo',
      tint: 'magenta',
      pacing: PACING,
    });
    expect(out.phase).toBe('speaking');
    expect(out.stream.map((s) => s.token).join('')).toBe('hi yo');
    expect(out.tint).toBe('magenta');
  });

  test('ignores blank or whitespace-only text', () => {
    expect(reduce(INITIAL_STATE, { type: 'STATUS', text: '', tint: 'cyan' })).toBe(INITIAL_STATE);
    expect(reduce(INITIAL_STATE, { type: 'STATUS', text: '   ', tint: 'cyan' })).toBe(
      INITIAL_STATE
    );
  });

  test('stream carries the punctuation breath baked in', () => {
    const out = reduce(INITIAL_STATE, {
      type: 'STATUS',
      text: 'hi. yo',
      tint: 'cyan',
      pacing: PACING,
    });
    const yIdx = out.stream.findIndex((s, i) => s.token === 'y' && i > 0);
    expect(out.stream[yIdx]?.pauseMs).toBe(PACING.sentencePauseMs);
  });

  test('interrupts a currently-playing reaction', () => {
    const reacting: HostState = {
      phase: 'reacting',
      stream: [{ mood: 'default', token: 'h', trailing: '', pauseMs: 10 }],
      cursor: 0,
      reaction: 'wave',
      tint: 'green',
    };
    const out = reduce(reacting, {
      type: 'STATUS',
      text: 'new line',
      tint: 'cyan',
      pacing: PACING,
    });
    expect(out.phase).toBe('speaking');
    expect(out.reaction).toBeNull();
    expect(out.stream.map((s) => s.token).join('')).toBe('new line');
  });
});

describe('reduce — IDLE_LINE events', () => {
  test('starts speaking when phase is idle', () => {
    const out = reduce(INITIAL_STATE, {
      type: 'IDLE_LINE',
      text: 'just chilling',
      tint: 'cyan',
      pacing: PACING,
    });
    expect(out.phase).toBe('speaking');
    expect(out.stream.map((s) => s.token).join('')).toBe('just chilling');
  });

  test('no-op when not idle (stale timer protection)', () => {
    const reacting: HostState = {
      phase: 'reacting',
      stream: [{ mood: 'default', token: 'h', trailing: '', pauseMs: 10 }],
      cursor: 0,
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
  test('advances cursor by 1 while typing', () => {
    const started = reduce(INITIAL_STATE, {
      type: 'STATUS',
      text: 'hello',
      tint: 'cyan',
      pacing: PACING,
    });
    const next = reduce(started, { type: 'REVEAL' });
    expect(next.cursor).toBe(1);
    expect(visibleText(next)).toBe('h');
  });

  test('no-op once cursor catches up to stream length', () => {
    const done: HostState = {
      phase: 'speaking',
      stream: [
        { mood: 'default', token: 'h', trailing: '', pauseMs: 10 },
        { mood: 'default', token: 'i', trailing: '', pauseMs: 10 },
      ],
      cursor: 2,
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
      stream: [{ mood: 'default', token: 'h', trailing: '', pauseMs: 10 }],
      cursor: 1,
      reaction: null,
      tint: 'magenta',
    };
    const out = reduce(speaking, { type: 'HOLD_OVER' });
    expect(out.phase).toBe('idle');
    expect(out.stream).toHaveLength(0);
    expect(out.cursor).toBe(0);
    expect(out.reaction).toBeNull();
    expect(out.tint).toBe('magenta');
  });
});

describe('isFinished', () => {
  test('false while idle', () => {
    expect(isFinished(INITIAL_STATE)).toBe(false);
  });

  test('true once cursor has reached stream length', () => {
    const done: HostState = {
      phase: 'speaking',
      stream: [
        { mood: 'default', token: 'h', trailing: '', pauseMs: 10 },
        { mood: 'default', token: 'i', trailing: '', pauseMs: 10 },
      ],
      cursor: 2,
      reaction: null,
      tint: 'cyan',
    };
    expect(isFinished(done)).toBe(true);
  });

  test('false while still typing', () => {
    const typing: HostState = {
      phase: 'speaking',
      stream: [
        { mood: 'default', token: 'h', trailing: '', pauseMs: 10 },
        { mood: 'default', token: 'i', trailing: '', pauseMs: 10 },
      ],
      cursor: 1,
      reaction: null,
      tint: 'cyan',
    };
    expect(isFinished(typing)).toBe(false);
  });
});

describe('visibleText', () => {
  test('returns the empty string when nothing is revealed', () => {
    expect(visibleText(INITIAL_STATE)).toBe('');
  });

  test('returns the rendered prefix after a few reveals', () => {
    let s = reduce(INITIAL_STATE, {
      type: 'STATUS',
      text: 'hi yo',
      tint: 'cyan',
      pacing: PACING,
    });
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'REVEAL' });
    }
    expect(visibleText(s)).toBe('hi ');
  });
});
