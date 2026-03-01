import { afterEach, describe, expect, test } from 'bun:test';
import { clearRegistry, getRegisteredRules, register, use } from '../registry';
import type { Buildable, Rule } from '../types';

const createRule = (name = 'test-rule'): Rule => ({
  name,
  async *check() {
    // no violations
  },
});

const createBuildable = (name = 'buildable-rule'): Buildable => ({
  build: () => createRule(name),
});

describe('registry', () => {
  afterEach(() => {
    clearRegistry();
  });

  // ─── register ───────────────────────────────────────────────────────────

  describe('register', () => {
    test('adds a buildable to the registry', () => {
      const buildable = createBuildable();

      register(buildable);

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('buildable-rule');
    });

    test('supports multiple registrations', () => {
      register(createBuildable('rule-a'));
      register(createBuildable('rule-b'));

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(2);
    });
  });

  // ─── use ────────────────────────────────────────────────────────────────

  describe('use', () => {
    test('registers a Buildable input', () => {
      use(createBuildable('from-use'));

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('from-use');
    });

    test('wraps a Rule input as Buildable', () => {
      const rule = createRule('raw-rule');

      use(rule);

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('raw-rule');
    });

    test('handles array inputs recursively', () => {
      const rule1 = createRule('rule-1');
      const rule2 = createBuildable('rule-2');

      use([
        rule1,
        rule2,
      ]);

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].name).toBe('rule-1');
      expect(rules[1].name).toBe('rule-2');
    });

    test('handles nested arrays', () => {
      const rule = createRule('nested');

      use([
        [
          rule,
        ] as unknown as Rule,
      ]);

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('nested');
    });

    test('accepts multiple arguments', () => {
      use(createRule('a'), createBuildable('b'), createRule('c'));

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(3);
    });

    test('skips non-Rule, non-Buildable inputs', () => {
      use('invalid' as unknown as Rule);

      const rules = getRegisteredRules();
      expect(rules).toHaveLength(0);
    });
  });

  // ─── getRegisteredRules ─────────────────────────────────────────────────

  describe('getRegisteredRules', () => {
    test('returns empty array when nothing registered', () => {
      expect(getRegisteredRules()).toHaveLength(0);
    });

    test('builds all registered buildables into rules', () => {
      register(createBuildable('a'));
      register(createBuildable('b'));

      const rules = getRegisteredRules();

      expect(rules).toHaveLength(2);
      expect(rules[0].name).toBe('a');
      expect(rules[1].name).toBe('b');
    });
  });

  // ─── clearRegistry ──────────────────────────────────────────────────────

  describe('clearRegistry', () => {
    test('removes all registered rules', () => {
      register(createBuildable());
      register(createBuildable());
      expect(getRegisteredRules()).toHaveLength(2);

      clearRegistry();

      expect(getRegisteredRules()).toHaveLength(0);
    });
  });
});
