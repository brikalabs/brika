import { describe, expect, test } from 'bun:test';
import {
  hasTemplate,
  parseExpression,
  resolveTemplate,
  type TemplateScope,
  templatedConfigView,
} from './template';

function scope(partial: Partial<TemplateScope>): TemplateScope {
  return { inputs: {}, config: {}, ...partial };
}

describe('hasTemplate', () => {
  test('detects an expression', () => {
    expect(hasTemplate('hello {{ inputs.in }}')).toBe(true);
  });

  test('ignores plain strings and lone braces', () => {
    expect(hasTemplate('no expression here')).toBe(false);
    expect(hasTemplate('{ not an expr }')).toBe(false);
  });

  test('is stable across repeated calls (no lastIndex bleed)', () => {
    expect(hasTemplate('{{ x }}')).toBe(true);
    expect(hasTemplate('{{ x }}')).toBe(true);
  });
});

describe('resolveTemplate', () => {
  test('substitutes an input port value', () => {
    const s = scope({ inputs: { in: 'world' } });
    expect(resolveTemplate('hello {{ inputs.in }}', s)).toBe('hello world');
  });

  test('navigates nested object and array paths', () => {
    const s = scope({ inputs: { in: { user: { name: 'Ada' }, tags: ['a', 'b'] } } });
    expect(resolveTemplate('{{ inputs.in.user.name }} / {{ inputs.in.tags.1 }}', s)).toBe(
      'Ada / b'
    );
  });

  test('renders objects as JSON and numbers via String', () => {
    const s = scope({ inputs: { in: { ts: 42 } } });
    expect(resolveTemplate('{{ inputs.in }}', s)).toBe('{"ts":42}');
    expect(resolveTemplate('{{ inputs.in.ts }}', s)).toBe('42');
  });

  test('renders missing paths and unknown roots as empty', () => {
    const s = scope({ inputs: { in: { a: 1 } } });
    expect(resolveTemplate('[{{ inputs.in.missing }}]', s)).toBe('[]');
    expect(resolveTemplate('[{{ nope.x }}]', s)).toBe('[]');
    expect(resolveTemplate('[{{ inputs.absent }}]', s)).toBe('[]');
  });

  test('resolves cross-config references', () => {
    const s = scope({ config: { name: 'Brika' } });
    expect(resolveTemplate('App: {{ config.name }}', s)).toBe('App: Brika');
  });

  test('tolerates whitespace and multiple expressions', () => {
    const s = scope({ inputs: { a: '1', b: '2' } });
    expect(resolveTemplate('{{inputs.a}}+{{   inputs.b   }}', s)).toBe('1+2');
  });
});

describe('templatedConfigView', () => {
  test('returns the parsed object unchanged when nothing is templated', () => {
    const parsed = { model: 'opus', maxTokens: 100 };
    const view = templatedConfigView(parsed, scope({}));
    expect(view).toBe(parsed);
  });

  test('resolves templated string fields lazily against the live scope', () => {
    const s = scope({ inputs: {} });
    const view = templatedConfigView({ prompt: 'Hi {{ inputs.in }}', model: 'opus' }, s);

    // Read before any input: empty substitution.
    expect(view.prompt).toBe('Hi ');
    expect(view.model).toBe('opus');

    // A later input event is reflected on the next read (getter, not snapshot).
    s.inputs.in = 'Ada';
    expect(view.prompt).toBe('Hi Ada');
  });

  test('leaves non-string and non-templated fields intact', () => {
    const view = templatedConfigView(
      { prompt: '{{ inputs.in }}', count: 3, flag: true },
      scope({ inputs: { in: 'x' } })
    );
    expect(view.prompt).toBe('x');
    expect(view.count).toBe(3);
    expect(view.flag).toBe(true);
  });
});

describe('resolveTemplate edge cases', () => {
  test('empty expression {{ }} resolves to empty string (empty path)', () => {
    // An expression whose entire content is whitespace yields an empty path
    // (segments.length === 0), which returns undefined, which stringifies to ''.
    const s = scope({});
    expect(resolveTemplate('[{{   }}]', s)).toBe('[]');
  });

  test('navigate returns undefined when current is a primitive (non-object)', () => {
    // inputs.greeting is a string; navigating deeper into it yields undefined.
    const s = scope({ inputs: { greeting: 'hello' } });
    expect(resolveTemplate('{{ inputs.greeting.length }}', s)).toBe('');
  });

  test('navigate returns undefined when current is null', () => {
    // A null value mid-path is dead — the rest resolves to empty.
    const s = scope({ inputs: { data: null } });
    expect(resolveTemplate('{{ inputs.data.field }}', s)).toBe('');
  });

  test('stringify renders a bigint as a string', () => {
    // BigInt is a valid scalar; should not fall through to JSON.stringify.
    const s = scope({ inputs: { n: BigInt(12345678901234) } });
    expect(resolveTemplate('{{ inputs.n }}', s)).toBe('12345678901234');
  });

  test('stringify renders undefined/null as empty string', () => {
    const s = scope({ inputs: { a: undefined, b: null } });
    expect(resolveTemplate('[{{ inputs.a }}][{{ inputs.b }}]', s)).toBe('[][]');
  });

  test('stringify falls back to empty string for circular JSON', () => {
    // A circular reference makes JSON.stringify throw; we expect empty string.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const s = scope({ inputs: { obj: circular } });
    // The expression resolves to the circular object; stringify catches the error.
    expect(resolveTemplate('{{ inputs.obj }}', s)).toBe('');
  });

  test('array index access works via navigate', () => {
    const s = scope({ inputs: { items: ['a', 'b', 'c'] } });
    expect(resolveTemplate('{{ inputs.items.2 }}', s)).toBe('c');
  });

  test('non-integer key on array resolves to undefined', () => {
    const s = scope({ inputs: { items: ['a', 'b'] } });
    expect(resolveTemplate('[{{ inputs.items.foo }}]', s)).toBe('[]');
  });
});

describe('expression grammar (brackets, quoted keys, fallbacks)', () => {
  const s = (inputs: Record<string, unknown>, config: Record<string, unknown> = {}) => ({
    inputs,
    config,
  });

  test('bracket index access', () => {
    expect(resolveTemplate('{{ inputs.items[1] }}', s({ items: ['a', 'b'] }))).toBe('b');
  });

  test('quoted bracket keys reach properties with special characters', () => {
    expect(
      resolveTemplate('{{ inputs.data["my key"].x }}', s({ data: { 'my key': { x: 7 } } }))
    ).toBe('7');
    expect(resolveTemplate("{{ inputs.data['a.b'] }}", s({ data: { 'a.b': 'dotted' } }))).toBe(
      'dotted'
    );
  });

  test('?? fallback takes the first non-nullish operand', () => {
    expect(
      resolveTemplate('{{ inputs.missing ?? config.title ?? "untitled" }}', s({}, { title: 'T' }))
    ).toBe('T');
    expect(resolveTemplate('{{ inputs.missing ?? "untitled" }}', s({}))).toBe('untitled');
    expect(resolveTemplate('{{ inputs.x ?? "d" }}', s({ x: 'real' }))).toBe('real');
  });

  test('literal operands: numbers, booleans, null', () => {
    expect(resolveTemplate('{{ inputs.n ?? 42 }}', s({}))).toBe('42');
    expect(resolveTemplate('{{ inputs.n ?? false }}', s({}))).toBe('false');
    expect(resolveTemplate('{{ null ?? "after-null" }}', s({}))).toBe('after-null');
  });

  test('falsy but non-nullish values are NOT skipped by ??', () => {
    expect(resolveTemplate('{{ inputs.zero ?? "d" }}', s({ zero: 0 }))).toBe('0');
    expect(resolveTemplate('{{ inputs.empty ?? "d" }}', s({ empty: '' }))).toBe('');
  });

  test('malformed expressions render empty instead of leaking syntax', () => {
    expect(resolveTemplate('{{ inputs.items[ }}', s({ items: [1] }))).toBe('');
    // Doubled/trailing dots stay lenient (historic behavior: empty segments skipped)
    expect(resolveTemplate('{{ inputs..x. }}', s({ x: 1 }))).toBe('1');
    expect(resolveTemplate('{{ "unterminated }}', s({}))).toBe('');
  });

  test('parseExpression exposes operands for editor-side validation', () => {
    expect(parseExpression('inputs.in.user ?? "anon"')).toEqual([
      { kind: 'path', segments: ['inputs', 'in', 'user'] },
      { kind: 'literal', value: 'anon' },
    ]);
    expect(parseExpression('inputs.items[0]')).toEqual([
      { kind: 'path', segments: ['inputs', 'items', '0'] },
    ]);
    expect(parseExpression('not a path !')).toBeNull();
  });
});
