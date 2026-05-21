import { describe, expect, test } from 'bun:test';
import { parseKey, translate } from '../translate';

describe('translate — basic lookup', () => {
  test('returns the value at a top-level key', () => {
    expect(translate({ hello: 'Hello' }, 'hello')).toBe('Hello');
  });

  test('returns the value at a nested key', () => {
    expect(translate({ ui: { title: 'T' } }, 'ui.title')).toBe('T');
  });

  test('returns defaultValue when key is absent', () => {
    expect(translate({}, 'missing', { defaultValue: 'fallback' })).toBe('fallback');
  });

  test('returns undefined when key is absent and no defaultValue', () => {
    expect(translate({}, 'missing')).toBeUndefined();
  });
});

describe('translate — interpolation', () => {
  test('substitutes {{var}} placeholders', () => {
    expect(translate({ greet: 'Hi {{name}}' }, 'greet', { name: 'Max' })).toBe('Hi Max');
  });

  test('passes locale to formatters', () => {
    expect(
      translate({ count: 'You have {{n, number}} items' }, 'count', { n: 1234, locale: 'en-US' })
    ).toBe('You have 1,234 items');
  });
});

describe('translate — pluralization', () => {
  test('selects _one / _other based on count', () => {
    const tree = {
      items_one: '1 item',
      items_other: '{{count}} items',
    };
    expect(translate(tree, 'items', { count: 1, locale: 'en' })).toBe('1 item');
    expect(translate(tree, 'items', { count: 5, locale: 'en' })).toBe('5 items');
  });

  test('falls back to _other when exact category is missing', () => {
    const tree = { items_other: '{{count}} items' };
    expect(translate(tree, 'items', { count: 1, locale: 'en' })).toBe('1 items');
  });

  test('uses bare key when no plural suffixes exist', () => {
    expect(translate({ items: 'static' }, 'items', { count: 5, locale: 'en' })).toBe('static');
  });

  test('French plural rules: 0 and 1 are one', () => {
    const tree = {
      items_one: '{{count}} élément',
      items_other: '{{count}} éléments',
    };
    expect(translate(tree, 'items', { count: 0, locale: 'fr' })).toBe('0 élément');
    expect(translate(tree, 'items', { count: 1, locale: 'fr' })).toBe('1 élément');
    expect(translate(tree, 'items', { count: 2, locale: 'fr' })).toBe('2 éléments');
  });
});

describe('translate — context', () => {
  test('applies _<context> suffix when context is provided', () => {
    const tree = { greet: 'Hi', greet_formal: 'Greetings' };
    expect(translate(tree, 'greet', { context: 'formal' })).toBe('Greetings');
    expect(translate(tree, 'greet')).toBe('Hi');
  });

  test('combines context and plural: <key>_<context>_<category>', () => {
    const tree = {
      reply_formal_one: 'You have 1 formal reply',
      reply_formal_other: 'You have {{count}} formal replies',
      reply_one: '1 reply',
      reply_other: '{{count}} replies',
    };
    expect(translate(tree, 'reply', { context: 'formal', count: 1, locale: 'en' })).toBe(
      'You have 1 formal reply'
    );
    expect(translate(tree, 'reply', { context: 'formal', count: 3, locale: 'en' })).toBe(
      'You have 3 formal replies'
    );
  });
});

describe('translate — arrays', () => {
  test('joins arrays with comma when the key points at one', () => {
    expect(translate({ items: ['a', 'b', 'c'] }, 'items')).toBe('a, b, c');
  });
});

describe('parseKey', () => {
  test('splits on first separator', () => {
    expect(parseKey('common:hello', 'translation')).toEqual({
      namespace: 'common',
      path: 'hello',
    });
  });

  test('supports nested paths in the key part', () => {
    expect(parseKey('plugin:foo:bar.baz', 'translation')).toEqual({
      namespace: 'plugin',
      path: 'foo:bar.baz',
    });
  });

  test('uses default namespace when no separator', () => {
    expect(parseKey('hello', 'common')).toEqual({ namespace: 'common', path: 'hello' });
  });

  test('respects custom separator', () => {
    expect(parseKey('common.hello', 'translation', '.')).toEqual({
      namespace: 'common',
      path: 'hello',
    });
  });
});
