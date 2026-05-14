import { describe, expect, test } from 'bun:test';
import { stripAnsiForFile } from './ansi';

const ESC = String.fromCodePoint(0x1b);

describe('stripAnsiForFile', () => {
  test('removes SGR color escapes', () => {
    expect(stripAnsiForFile(`${ESC}[31mred${ESC}[0m text`)).toBe('red text');
  });

  test('removes CSI cursor escapes', () => {
    expect(stripAnsiForFile(`hello${ESC}[2A${ESC}[Kworld`)).toBe('helloworld');
  });

  test('preserves plain text unchanged', () => {
    expect(stripAnsiForFile('no escapes here')).toBe('no escapes here');
    expect(stripAnsiForFile('')).toBe('');
  });

  test('handles multiple escapes in one line', () => {
    const input = `${ESC}[1m${ESC}[31mBold red${ESC}[0m and ${ESC}[32mgreen${ESC}[0m`;
    expect(stripAnsiForFile(input)).toBe('Bold red and green');
  });
});
