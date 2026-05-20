import { describe, expect, test } from 'bun:test';
import { htmlEscape } from '../../internal/html-escape';

describe('htmlEscape', () => {
  test('escapes the five HTML-significant characters', () => {
    expect(htmlEscape('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  test('leaves plain text unchanged', () => {
    expect(htmlEscape('hello world 123')).toBe('hello world 123');
  });

  test('neutralizes a script tag payload', () => {
    expect(htmlEscape('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('neutralizes an event-handler attribute injection', () => {
    expect(htmlEscape('" onerror="alert(1)')).toBe('&quot; onerror=&quot;alert(1)');
  });

  test('escapes & first to avoid double-encoding', () => {
    expect(htmlEscape('&amp;')).toBe('&amp;amp;');
  });

  test('empty string passes through unchanged', () => {
    expect(htmlEscape('')).toBe('');
  });
});
