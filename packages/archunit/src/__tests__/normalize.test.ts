import { describe, expect, test } from 'bun:test';
import { isBuildable, isRule, normalizeRules } from '../normalize';
import type { Buildable, Rule, RuleInput } from '../types';

const createRule = (name = 'test-rule'): Rule => ({
  name,
  async *check() {
    // no violations
  },
});

const createBuildable = (name = 'buildable-rule'): Buildable => ({
  build: () => createRule(name),
});

describe('isBuildable', () => {
  test('returns true for object with build function', () => {
    expect(isBuildable(createBuildable())).toBeTrue();
  });

  test('returns false for a Rule (no build)', () => {
    expect(isBuildable(createRule())).toBeFalse();
  });

  test('returns false for non-object', () => {
    expect(isBuildable('string' as unknown as RuleInput)).toBeFalse();
  });

  test('returns false for object with non-function build', () => {
    expect(
      isBuildable({
        build: 'not-a-fn',
      } as unknown as RuleInput)
    ).toBeFalse();
  });
});

describe('isRule', () => {
  test('returns true for object with check function', () => {
    expect(isRule(createRule())).toBeTrue();
  });

  test('returns false for a Buildable (no check)', () => {
    expect(isRule(createBuildable())).toBeFalse();
  });

  test('returns false for non-object', () => {
    expect(isRule('string' as unknown as RuleInput)).toBeFalse();
  });
});

describe('normalizeRules', () => {
  test('passes through Rule objects', () => {
    const rule = createRule('direct');

    const result = normalizeRules([rule]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('direct');
  });

  test('builds Buildable inputs', () => {
    const buildable = createBuildable('built');

    const result = normalizeRules([buildable]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('built');
  });

  test('flattens nested arrays', () => {
    const rule1 = createRule('r1');
    const rule2 = createRule('r2');

    const result = normalizeRules([[rule1, rule2] as unknown as RuleInput]);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('r1');
    expect(result[1].name).toBe('r2');
  });

  test('handles mixed inputs', () => {
    const rule = createRule('rule');
    const buildable = createBuildable('buildable');

    const result = normalizeRules([rule, buildable]);

    expect(result).toHaveLength(2);
  });

  test('skips unrecognized inputs', () => {
    const result = normalizeRules(['not-valid' as unknown as RuleInput]);

    expect(result).toHaveLength(0);
  });

  test('handles empty array', () => {
    expect(normalizeRules([])).toHaveLength(0);
  });

  test('handles deeply nested arrays', () => {
    const rule = createRule('deep');
    const nested = [[[rule] as unknown as RuleInput] as unknown as RuleInput] as RuleInput[];

    const result = normalizeRules(nested);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('deep');
  });
});
