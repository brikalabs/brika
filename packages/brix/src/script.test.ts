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

describe('expandReveal — word mode', () => {
  test('splits into whitespace-separated words preserving trailing spaces', () => {
    const segs = parseMoodScript('hello {:happy:}world');
    expect(expandReveal(segs, 'word')).toEqual([
      { mood: 'default', token: 'hello', trailing: ' ' },
      { mood: 'happy', token: 'world', trailing: '' },
    ]);
  });
});

describe('expandReveal — typewriter mode', () => {
  test('every char is its own step', () => {
    const segs = parseMoodScript('hi');
    const out = expandReveal(segs, 'typewriter');
    expect(out.map((s) => s.token)).toEqual(['h', 'i']);
  });

  test('first char of a word carries the long word-pause delay', () => {
    const segs = parseMoodScript('hi yo');
    const out = expandReveal(segs, 'typewriter', { charMs: 10, wordPauseMs: 200 });
    // 'h' is the first char — preceded by an implicit boundary (prevWasSpace = true initially).
    expect(out[0]?.pauseMs).toBe(200);
    expect(out[1]?.pauseMs).toBe(10); // 'i' — in-word
    expect(out[2]?.pauseMs).toBe(10); // ' ' — space char
    expect(out[3]?.pauseMs).toBe(200); // 'y' — first char after space
    expect(out[4]?.pauseMs).toBe(10); // 'o'
  });

  test('sentence-end punctuation buys a longer breath before the next word', () => {
    const segs = parseMoodScript('hi. yo');
    const out = expandReveal(segs, 'typewriter', {
      charMs: 10,
      wordPauseMs: 200,
      sentencePauseMs: 500,
    });
    // 'h'(200) 'i'(10) '.'(10) ' '(10) 'y'(500 — sentence breath) 'o'(10)
    expect(out.map((s) => s.pauseMs)).toEqual([200, 10, 10, 10, 500, 10]);
  });

  test('clause break injects a moderate pause before the next word', () => {
    const segs = parseMoodScript('hi, yo');
    const out = expandReveal(segs, 'typewriter', {
      charMs: 10,
      wordPauseMs: 200,
      clausePauseMs: 300,
    });
    // 'y' lands with clause-pause (300), beating the regular wordPause (200).
    expect(out[4]?.token).toBe('y');
    expect(out[4]?.pauseMs).toBe(300);
  });

  test('sentence breath beats clause break when both are queued', () => {
    const segs = parseMoodScript('hi,. yo');
    const out = expandReveal(segs, 'typewriter', {
      charMs: 10,
      wordPauseMs: 50,
      clausePauseMs: 200,
      sentencePauseMs: 500,
    });
    // The `.` after `,` promotes the breath to sentence-strength.
    expect(out[5]?.token).toBe('y');
    expect(out[5]?.pauseMs).toBe(500);
  });

  test('word-pause wins when stronger than the pending breath', () => {
    const segs = parseMoodScript('hi: yo');
    const out = expandReveal(segs, 'typewriter', {
      charMs: 10,
      wordPauseMs: 400,
      clausePauseMs: 100,
    });
    // wordPause (400) > clause pending (100) → wordPause wins.
    expect(out[4]?.token).toBe('y');
    expect(out[4]?.pauseMs).toBe(400);
  });
});
