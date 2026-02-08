/**
 * Tests for the Sparks context module
 *
 * Tests setupSparks() in isolation by providing a mock ContextCore.
 * Covers: registerSpark, emitSpark, subscribeSpark, sparkEvent IPC handler.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupSparks } from '../../context/sparks';
import { createTestHarness, type Handler } from './_test-utils';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const h = createTestHarness({
  sparks: [{ id: 'test-spark', name: 'Test Spark' }],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupSparks', () => {
  let methods: ReturnType<typeof setupSparks>['methods'];

  beforeEach(() => {
    // Reset all mock state
    h.reset();

    // Create a fresh sparks module
    const result = setupSparks(h.core);
    methods = result.methods;
  });

  // ─────────────────────────────────────────────────────────────────────
  // registerSpark
  // ─────────────────────────────────────────────────────────────────────

  describe('registerSpark', () => {
    test('sends IPC with correct payload', () => {
      const result = methods.registerSpark({ id: 'test-spark' });

      expect(result).toEqual({ id: 'test-spark' });

      const msg = h.sentMessages.find((m) => m.name === 'registerSpark');
      expect(msg).toBeDefined();
      expect(msg!.payload).toEqual({
        spark: { id: 'test-spark', schema: undefined },
      });
    });

    test('sends IPC with schema when provided', () => {
      const schema = { type: 'object', properties: { temp: { type: 'number' } } };
      const result = methods.registerSpark({ id: 'test-spark', schema });

      expect(result).toEqual({ id: 'test-spark' });

      const msg = h.sentMessages.find((m) => m.name === 'registerSpark');
      expect(msg).toBeDefined();
      expect(msg!.payload).toEqual({
        spark: { id: 'test-spark', schema },
      });
    });

    test('throws for undeclared spark', () => {
      expect(() => methods.registerSpark({ id: 'unknown-spark' })).toThrow(
        'Spark "unknown-spark" not in package.json'
      );
    });

    test('throws for duplicate registration', () => {
      methods.registerSpark({ id: 'test-spark' });

      expect(() => methods.registerSpark({ id: 'test-spark' })).toThrow(
        'Spark "test-spark" already registered'
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // emitSpark
  // ─────────────────────────────────────────────────────────────────────

  describe('emitSpark', () => {
    test('sends IPC with sparkId and payload', () => {
      methods.emitSpark('test-spark', { temperature: 22.5 });

      const msg = h.sentMessages.find((m) => m.name === 'emitSpark');
      expect(msg).toBeDefined();
      expect(msg!.payload).toEqual({
        sparkId: 'test-spark',
        payload: { temperature: 22.5 },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // subscribeSpark
  // ─────────────────────────────────────────────────────────────────────

  describe('subscribeSpark', () => {
    test('sends IPC and returns cleanup function', () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = methods.subscribeSpark('other-plugin:temperature', handler);

      expect(typeof unsub).toBe('function');

      const msg = h.sentMessages.find((m) => m.name === 'subscribeSpark');
      expect(msg).toBeDefined();
      const payload = msg!.payload as { sparkType: string; subscriptionId: string };
      expect(payload.sparkType).toBe('other-plugin:temperature');
      expect(payload.subscriptionId).toMatch(/^spark-sub-/);
    });

    test('delivers events to handler via sparkEvent IPC handler', () => {
      const received: unknown[] = [];
      methods.subscribeSpark('other-plugin:temperature', (event) => {
        received.push(event);
      });

      // Extract the subscription ID from the sent message
      const subMsg = h.sentMessages.find((m) => m.name === 'subscribeSpark');
      const subId = (subMsg!.payload as { subscriptionId: string }).subscriptionId;

      // Simulate hub delivering a spark event via the sparkEvent handler
      const event = {
        type: 'other-plugin:temperature',
        payload: { temp: 22 },
        source: 'other-plugin',
        ts: Date.now(),
        id: 'evt-1',
      };
      h.triggerOn('sparkEvent', { subscriptionId: subId, event });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);
    });

    test('unsubscribe sends IPC and stops delivery', () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = methods.subscribeSpark('other:spark', handler);

      // Get the subscription ID
      const subMsg = h.sentMessages.find((m) => m.name === 'subscribeSpark');
      const subId = (subMsg!.payload as { subscriptionId: string }).subscriptionId;

      // Unsubscribe
      unsub();

      // Verify unsubscribe IPC was sent
      const unsubMsg = h.sentMessages.find((m) => m.name === 'unsubscribeSpark');
      expect(unsubMsg).toBeDefined();
      expect(unsubMsg!.payload).toEqual({ subscriptionId: subId });

      // Verify events are no longer delivered
      h.triggerOn('sparkEvent', {
        subscriptionId: subId,
        event: { type: 'x', payload: null, source: 'x', ts: 0, id: 'x' },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    test('unknown subscription is ignored', () => {
      // Should not throw when sparkEvent arrives for a non-existent subscription
      h.triggerOn('sparkEvent', {
        subscriptionId: 'nonexistent-sub',
        event: { type: 'x', payload: null, source: 'x', ts: 0, id: 'x' },
      });
    });

    test('subscription IDs increment', () => {
      methods.subscribeSpark('a:b', () => {
        /* noop */
      });
      methods.subscribeSpark('c:d', () => {
        /* noop */
      });

      const subMsgs = h.sentMessages.filter((m) => m.name === 'subscribeSpark');
      const ids = subMsgs.map((m) => (m.payload as { subscriptionId: string }).subscriptionId);

      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);
      // Both should follow the spark-sub-N pattern with incrementing N
      expect(ids[0]).toMatch(/^spark-sub-\d+$/);
      expect(ids[1]).toMatch(/^spark-sub-\d+$/);

      // Extract numeric suffixes and verify they increment
      const num0 = Number.parseInt(ids[0]!.replace('spark-sub-', ''), 10);
      const num1 = Number.parseInt(ids[1]!.replace('spark-sub-', ''), 10);
      expect(num1).toBe(num0 + 1);
    });
  });
});
