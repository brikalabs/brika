/**
 * Tests for RestartPolicy - crash loop protection with exponential backoff
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { RestartPolicy } from '@/runtime/plugins/restart-policy';

describe('RestartPolicy', () => {
  let policy: RestartPolicy;

  beforeEach(() => {
    policy = new RestartPolicy({
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      maxCrashes: 3,
      crashWindowMs: 10000,
      stabilityThresholdMs: 5000,
    });
  });

  afterEach(() => {
    // Clean up any timers
    policy.reset('test');
  });

  describe('onCrash', () => {
    test('returns restart decision with base delay on first crash', () => {
      const decision = policy.onCrash('test');

      expect(decision.action).toBe('restart');
      if (decision.action === 'restart') {
        expect(decision.delayMs).toBe(1000);
      }
    });

    test('doubles delay with exponential backoff', () => {
      const first = policy.onCrash('test');
      const second = policy.onCrash('test');
      const third = policy.onCrash('test');

      expect(first.action).toBe('restart');
      expect(second.action).toBe('restart');
      // Third crash should trigger crash loop since maxCrashes is 3
      expect(third.action).toBe('crash-loop');

      if (first.action === 'restart') {
        expect(first.delayMs).toBe(1000);
      }
      if (second.action === 'restart') {
        expect(second.delayMs).toBe(2000);
      }
    });

    test('respects max delay', () => {
      // With baseDelayMs=1000, maxDelayMs=8000
      // Crash 1: 1000, Crash 2: 2000, Crash 3: crash-loop
      // We need more crashes within different windows to test max delay
      const shortWindowPolicy = new RestartPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 4000,
        maxCrashes: 10,
        crashWindowMs: 60000,
        stabilityThresholdMs: 5000,
      });

      shortWindowPolicy.onCrash('test'); // 1000
      shortWindowPolicy.onCrash('test'); // 2000
      const third = shortWindowPolicy.onCrash('test'); // 4000 (capped)
      const fourth = shortWindowPolicy.onCrash('test'); // 4000 (still capped)

      if (third.action === 'restart') {
        expect(third.delayMs).toBe(4000);
      }
      if (fourth.action === 'restart') {
        expect(fourth.delayMs).toBe(4000);
      }

      shortWindowPolicy.reset('test');
    });

    test('detects crash loop when max crashes reached', () => {
      policy.onCrash('test');
      policy.onCrash('test');
      const decision = policy.onCrash('test');

      expect(decision.action).toBe('crash-loop');
      if (decision.action === 'crash-loop') {
        expect(decision.reason).toContain('3 crashes');
      }
    });

    test('tracks crashes independently per id', () => {
      policy.onCrash('plugin-a');
      policy.onCrash('plugin-a');

      const decisionA = policy.onCrash('plugin-a');
      const decisionB = policy.onCrash('plugin-b');

      expect(decisionA.action).toBe('crash-loop');
      expect(decisionB.action).toBe('restart');
    });
  });

  describe('onStart', () => {
    test('records start time', () => {
      policy.onStart('test');
      const state = policy.getState('test');

      expect(state?.lastStartAt).toBeDefined();
      expect(state?.lastStartAt).toBeGreaterThan(0);
    });
  });

  describe('checkStability', () => {
    test('returns false when not started', () => {
      expect(policy.checkStability('test')).toBe(false);
    });

    test('returns false when not stable yet', () => {
      policy.onStart('test');
      expect(policy.checkStability('test')).toBe(false);
    });

    test('resets backoff level when stable', async () => {
      // Create a policy with very short stability threshold
      const fastPolicy = new RestartPolicy({
        baseDelayMs: 100,
        maxDelayMs: 1000,
        maxCrashes: 5,
        crashWindowMs: 10000,
        stabilityThresholdMs: 50, // 50ms stability threshold
      });

      fastPolicy.onCrash('test');
      fastPolicy.onCrash('test');
      fastPolicy.onStart('test');

      // Wait for stability threshold
      await new Promise((resolve) => setTimeout(resolve, 60));

      const isStable = fastPolicy.checkStability('test');
      expect(isStable).toBe(true);

      // Backoff should be reset
      const decision = fastPolicy.onCrash('test');
      if (decision.action === 'restart') {
        expect(decision.delayMs).toBe(100); // Back to base
      }

      fastPolicy.reset('test');
    });
  });

  describe('scheduleRestart', () => {
    test('schedules callback after delay', async () => {
      let called = false;
      policy.scheduleRestart('test', 50, () => {
        called = true;
      });

      expect(called).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(called).toBe(true);
    });

    test('cancels previous timer when scheduling new one', async () => {
      let firstCalled = false;
      let secondCalled = false;

      policy.scheduleRestart('test', 100, () => {
        firstCalled = true;
      });
      policy.scheduleRestart('test', 50, () => {
        secondCalled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(firstCalled).toBe(false);
      expect(secondCalled).toBe(true);
    });
  });

  describe('cancelPending', () => {
    test('cancels scheduled restart', async () => {
      let called = false;
      policy.scheduleRestart('test', 50, () => {
        called = true;
      });

      policy.cancelPending('test');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(called).toBe(false);
    });

    test('handles cancel when no pending restart', () => {
      // Should not throw
      expect(() => policy.cancelPending('test')).not.toThrow();
    });
  });

  describe('reset', () => {
    test('clears all state for id', () => {
      policy.onCrash('test');
      policy.onStart('test');
      policy.reset('test');

      expect(policy.getState('test')).toBeUndefined();
    });

    test('cancels pending timer', async () => {
      let called = false;
      policy.scheduleRestart('test', 100, () => {
        called = true;
      });

      policy.reset('test');
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(called).toBe(false);
    });
  });

  describe('getState', () => {
    test('returns undefined for unknown id', () => {
      expect(policy.getState('unknown')).toBeUndefined();
    });

    test('returns current state after operations', () => {
      policy.onCrash('test');
      policy.onStart('test');

      const state = policy.getState('test');
      expect(state).toBeDefined();
      expect(state?.backoffLevel).toBe(1);
      expect(state?.crashTimestamps.length).toBe(1);
      expect(state?.lastStartAt).toBeDefined();
    });
  });

  describe('default config', () => {
    test('uses default values when not provided', () => {
      const defaultPolicy = new RestartPolicy();

      expect(defaultPolicy.config.baseDelayMs).toBe(1000);
      expect(defaultPolicy.config.maxDelayMs).toBe(60000);
      expect(defaultPolicy.config.maxCrashes).toBe(5);
      expect(defaultPolicy.config.crashWindowMs).toBe(60000);
      expect(defaultPolicy.config.stabilityThresholdMs).toBe(30000);
    });

    test('allows partial config override', () => {
      const partialPolicy = new RestartPolicy({
        baseDelayMs: 500,
      });

      expect(partialPolicy.config.baseDelayMs).toBe(500);
      expect(partialPolicy.config.maxDelayMs).toBe(60000); // default
    });
  });
});
