import { describe, expect, test } from 'bun:test';
import { hasTemplate, resolveTemplate, type TemplateScope, templatedConfigView } from './template';

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
