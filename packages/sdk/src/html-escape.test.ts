import { describe, expect, test } from 'bun:test';
import { htmlEscape } from './internal/html-escape';

describe('htmlEscape', () => {
  test('escapes the five OWASP characters', () => {
    expect(htmlEscape('&')).toBe('&amp;');
    expect(htmlEscape('<')).toBe('&lt;');
    expect(htmlEscape('>')).toBe('&gt;');
    expect(htmlEscape('"')).toBe('&quot;');
    expect(htmlEscape("'")).toBe('&#39;');
  });

  test('escapes a script-injection payload', () => {
    const out = htmlEscape('<script>alert(1)</script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  test('escapes attribute-breaking payload', () => {
    const out = htmlEscape('" onerror="alert(1)');
    expect(out).toBe('&quot; onerror=&quot;alert(1)');
  });

  test('escapes ampersand first to avoid double-escaping', () => {
    // `<` would become `&lt;`; the leading `&` must already be encoded as
    // `&amp;` BEFORE we look at the `<`, otherwise we'd produce `&amp;lt;`
    // when given `&lt;` as raw input. Validates the single-pass design.
    expect(htmlEscape('&lt;')).toBe('&amp;lt;');
  });

  test('passes through safe characters unchanged', () => {
    expect(htmlEscape('hello world 123')).toBe('hello world 123');
    expect(htmlEscape('')).toBe('');
  });

  test('handles unicode without mangling', () => {
    expect(htmlEscape('café — naïve')).toBe('café — naïve');
    expect(htmlEscape('日本語')).toBe('日本語');
  });
});
