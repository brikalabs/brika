import { describe, expect, test } from 'bun:test';
import { parseFormatCodes } from './codes';

describe('parseFormatCodes', () => {
  test('plain text → one default segment, plain equals input', () => {
    const r = parseFormatCodes('hello world');
    expect(r.plain).toBe('hello world');
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]?.text).toBe('hello world');
    expect(r.segments[0]?.bold).toBe(false);
    expect(r.segments[0]?.color).toBeUndefined();
  });

  test('§l toggles bold for following segment, §r resets', () => {
    const r = parseFormatCodes('a §lB§r c');
    expect(r.plain).toBe('a B c');
    expect(r.segments.map((s) => [s.text, s.bold])).toEqual([
      ['a ', false],
      ['B', true],
      [' c', false],
    ]);
  });

  test('combines bold + italic + color', () => {
    const r = parseFormatCodes('§l§o§4HEY§r');
    expect(r.plain).toBe('HEY');
    expect(r.segments).toHaveLength(1);
    const [seg] = r.segments;
    expect(seg?.text).toBe('HEY');
    expect(seg?.bold).toBe(true);
    expect(seg?.italic).toBe(true);
    expect(seg?.color).toBe('red');
  });

  test('§k flags obfuscated runs without affecting plain text', () => {
    const r = parseFormatCodes('hub is §khumming§r along');
    expect(r.plain).toBe('hub is humming along');
    const obf = r.segments.find((s) => s.obfuscated);
    expect(obf?.text).toBe('humming');
  });

  test('mid-sentence colour changes split into runs of the right tints', () => {
    const r = parseFormatCodes('§6one§r §4star§r');
    expect(r.plain).toBe('one star');
    expect(r.segments.map((s) => [s.text, s.color])).toEqual([
      ['one', 'yellow'],
      [' ', undefined],
      ['star', 'red'],
    ]);
  });

  test('unknown §<x> is passed through as literal characters', () => {
    const r = parseFormatCodes('§z hi');
    expect(r.plain).toBe('§z hi');
    expect(r.segments).toHaveLength(1);
  });

  test('trailing lone § is preserved', () => {
    const r = parseFormatCodes('done §');
    expect(r.plain).toBe('done §');
  });

  test('empty input yields no segments', () => {
    const r = parseFormatCodes('');
    expect(r.plain).toBe('');
    expect(r.segments).toEqual([]);
  });

  test('§R flags rainbow runs without affecting plain text', () => {
    const r = parseFormatCodes('§Rmagic§r ends');
    expect(r.plain).toBe('magic ends');
    const rainbow = r.segments.find((s) => s.rainbow);
    expect(rainbow?.text).toBe('magic');
    expect(rainbow?.rainbow).toBe(true);
    const tail = r.segments.find((s) => s.text === ' ends');
    expect(tail?.rainbow).toBe(false);
  });

  test('rainbow + bold combine on a single segment', () => {
    const r = parseFormatCodes('§l§Rwow§r');
    const [seg] = r.segments;
    expect(seg?.rainbow).toBe(true);
    expect(seg?.bold).toBe(true);
  });
});
