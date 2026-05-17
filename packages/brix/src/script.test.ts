import { describe, expect, test } from 'bun:test';
import { expandReveal, parseMoodScript } from './script';

describe('parseMoodScript', () => {
  test('returns a single segment for plain text', () => {
    expect(parseMoodScript('hello world')).toEqual([{ mood: 'default', text: 'hello world' }]);
  });

  test('uses defaultMood for the leading segment', () => {
    expect(parseMoodScript('hello', 'thinking')).toEqual([{ mood: 'thinking', text: 'hello' }]);
  });

  test('mood token swaps the mood for everything that follows', () => {
    expect(parseMoodScript('hi {:happy:}there')).toEqual([
      { mood: 'default', text: 'hi ' },
      { mood: 'happy', text: 'there' },
    ]);
  });

  test('multiple tokens chain correctly', () => {
    expect(parseMoodScript('{:thinking:}untangling… {:happy:}done!')).toEqual([
      { mood: 'thinking', text: 'untangling… ' },
      { mood: 'happy', text: 'done!' },
    ]);
  });

  test('unknown mood is preserved as literal text', () => {
    const out = parseMoodScript('hi {:bogus:}there');
    expect(out).toEqual([
      { mood: 'default', text: 'hi ' },
      { mood: 'default', text: '{:bogus:}' },
      { mood: 'default', text: 'there' },
    ]);
  });

  test('empty input yields empty array', () => {
    expect(parseMoodScript('')).toEqual([]);
  });
});

describe('expandReveal', () => {
  test('emits one step per character', () => {
    expect(expandReveal(parseMoodScript('hi')).map((s) => s.token)).toEqual(['h', 'i']);
  });

  test('first char of a word lands with the word-pause delay', () => {
    const out = expandReveal(parseMoodScript('hi yo'), { charMs: 10, wordPauseMs: 200 });
    expect(out[0]?.pauseMs).toBe(200); // 'h' — implicit boundary at start
    expect(out[1]?.pauseMs).toBe(10); // 'i' — in-word
    expect(out[2]?.pauseMs).toBe(10); // ' ' — space char
    expect(out[3]?.pauseMs).toBe(200); // 'y' — first char after space
    expect(out[4]?.pauseMs).toBe(10); // 'o'
  });

  test('sentence-end punctuation buys a longer breath before the next word', () => {
    const out = expandReveal(parseMoodScript('hi. yo'), {
      charMs: 10,
      wordPauseMs: 200,
      sentencePauseMs: 500,
    });
    // 'h'(200) 'i'(10) '.'(10) ' '(10) 'y'(500 — breath) 'o'(10)
    expect(out.map((s) => s.pauseMs)).toEqual([200, 10, 10, 10, 500, 10]);
  });

  test('clause break injects a moderate pause before the next word', () => {
    const out = expandReveal(parseMoodScript('hi, yo'), {
      charMs: 10,
      wordPauseMs: 200,
      clausePauseMs: 300,
    });
    expect(out[4]?.token).toBe('y');
    expect(out[4]?.pauseMs).toBe(300); // clause-pause beats wordPause
  });

  test('sentence breath beats clause break when both are queued', () => {
    const out = expandReveal(parseMoodScript('hi,. yo'), {
      charMs: 10,
      wordPauseMs: 50,
      clausePauseMs: 200,
      sentencePauseMs: 500,
    });
    expect(out[5]?.token).toBe('y');
    expect(out[5]?.pauseMs).toBe(500); // `.` after `,` promotes to sentence
  });

  test('word-pause wins when stronger than the pending breath', () => {
    const out = expandReveal(parseMoodScript('hi: yo'), {
      charMs: 10,
      wordPauseMs: 400,
      clausePauseMs: 100,
    });
    expect(out[4]?.token).toBe('y');
    expect(out[4]?.pauseMs).toBe(400);
  });

  test('mood tokens propagate to every step in their segment', () => {
    const out = expandReveal(parseMoodScript('{:happy:}hi'));
    expect(out.every((s) => s.mood === 'happy')).toBe(true);
  });
});
