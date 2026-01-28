/**
 * Tests for event pattern matching utilities
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineActions } from '../action';
import {
  createPatternSet,
  isFilteredAction,
  matchesPattern,
  matchesPatternSet,
  withPredicate,
} from '../matcher';

// Create test action creators
const TestActions = defineActions('test', {
  one: z.object({ value: z.number() }),
  two: z.object({ name: z.string() }),
  three: z.void(),
});

describe('matcher', () => {
  describe('withPredicate', () => {
    test('creates a filtered action', () => {
      const filtered = withPredicate(TestActions.one, (a) => a.payload.value > 5);

      expect(isFilteredAction(filtered)).toBe(true);
      expect(filtered.creator).toBe(TestActions.one);
    });

    test('predicate is called with action', () => {
      let calledWith: unknown = null;
      const filtered = withPredicate(TestActions.one, (a) => {
        calledWith = a;
        return true;
      });

      const action = TestActions.one.create({ value: 42 }, 'test');
      filtered.predicate(action);

      expect(calledWith).toBe(action);
    });
  });

  describe('isFilteredAction', () => {
    test('returns true for filtered actions', () => {
      const filtered = withPredicate(TestActions.one, () => true);
      expect(isFilteredAction(filtered)).toBe(true);
    });

    test('returns false for action creators', () => {
      expect(isFilteredAction(TestActions.one)).toBe(false);
    });

    test('returns false for null/undefined', () => {
      expect(isFilteredAction(null)).toBe(false);
      expect(isFilteredAction(undefined)).toBe(false);
    });

    test('returns false for plain objects', () => {
      expect(isFilteredAction({})).toBe(false);
      expect(isFilteredAction({ type: 'test' })).toBe(false);
    });
  });

  describe('matchesPattern', () => {
    test('matches single action creator', () => {
      const action = TestActions.one.create({ value: 1 }, 'test');

      expect(matchesPattern(TestActions.one, action)).toBe(true);
      expect(matchesPattern(TestActions.two, action)).toBe(false);
    });

    test('matches filtered action with passing predicate', () => {
      const action = TestActions.one.create({ value: 10 }, 'test');
      const filtered = withPredicate(TestActions.one, (a) => a.payload.value > 5);

      expect(matchesPattern(filtered, action)).toBe(true);
    });

    test('does not match filtered action with failing predicate', () => {
      const action = TestActions.one.create({ value: 3 }, 'test');
      const filtered = withPredicate(TestActions.one, (a) => a.payload.value > 5);

      expect(matchesPattern(filtered, action)).toBe(false);
    });

    test('matches array of action creators', () => {
      const action1 = TestActions.one.create({ value: 1 }, 'test');
      const action2 = TestActions.two.create({ name: 'test' }, 'test');
      const action3 = TestActions.three.create(undefined, 'test');

      const pattern = [TestActions.one, TestActions.two];

      expect(matchesPattern(pattern, action1)).toBe(true);
      expect(matchesPattern(pattern, action2)).toBe(true);
      expect(matchesPattern(pattern, action3)).toBe(false);
    });

    test('matches array with filtered actions', () => {
      const action = TestActions.one.create({ value: 10 }, 'test');
      const filtered = withPredicate(TestActions.one, (a) => a.payload.value > 5);

      const pattern = [filtered, TestActions.two];

      expect(matchesPattern(pattern, action)).toBe(true);
    });

    test('matches action map (object)', () => {
      const action1 = TestActions.one.create({ value: 1 }, 'test');
      const action2 = TestActions.two.create({ name: 'test' }, 'test');

      expect(matchesPattern(TestActions, action1)).toBe(true);
      expect(matchesPattern(TestActions, action2)).toBe(true);
    });
  });

  describe('createPatternSet', () => {
    test('creates set from single action creator', () => {
      const result = createPatternSet(TestActions.one);

      expect(result.ids.size).toBe(1);
      expect(result.predicates.size).toBe(0);
    });

    test('creates set from filtered action', () => {
      const filtered = withPredicate(TestActions.one, () => true);
      const result = createPatternSet(filtered);

      expect(result.ids.size).toBe(1);
      expect(result.predicates.size).toBe(1);
    });

    test('creates set from array', () => {
      const result = createPatternSet([TestActions.one, TestActions.two]);

      expect(result.ids.size).toBe(2);
    });

    test('creates set from action map', () => {
      const result = createPatternSet(TestActions);

      expect(result.ids.size).toBe(3);
    });
  });

  describe('matchesPatternSet', () => {
    test('matches action in set', () => {
      const action = TestActions.one.create({ value: 1 }, 'test');
      const patternSet = createPatternSet([TestActions.one, TestActions.two]);

      expect(matchesPatternSet(patternSet, action)).toBe(true);
    });

    test('does not match action not in set', () => {
      const action = TestActions.three.create(undefined, 'test');
      const patternSet = createPatternSet([TestActions.one, TestActions.two]);

      expect(matchesPatternSet(patternSet, action)).toBe(false);
    });

    test('applies predicate from filtered action', () => {
      const passing = TestActions.one.create({ value: 10 }, 'test');
      const failing = TestActions.one.create({ value: 3 }, 'test');

      const filtered = withPredicate(TestActions.one, (a) => a.payload.value > 5);
      const patternSet = createPatternSet(filtered);

      expect(matchesPatternSet(patternSet, passing)).toBe(true);
      expect(matchesPatternSet(patternSet, failing)).toBe(false);
    });
  });
});
