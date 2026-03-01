/**
 * Tests for SubscriberManager
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineActions } from '../action';
import { SubscriberManager } from '../subscriber';

const TestActions = defineActions('test', {
  one: z.object({
    value: z.number(),
  }),
  two: z.object({
    name: z.string(),
  }),
});

describe('SubscriberManager', () => {
  test('subscribes and receives matching actions', () => {
    const manager = new SubscriberManager();
    const received: unknown[] = [];

    manager.subscribe(TestActions.one, (action) => {
      received.push(action);
    });

    const action = TestActions.one.create(
      {
        value: 42,
      },
      'test'
    );
    manager.notify(action);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(action);
  });

  test('does not notify for non-matching actions', () => {
    const manager = new SubscriberManager();
    const received: unknown[] = [];

    manager.subscribe(TestActions.one, (action) => {
      received.push(action);
    });

    const action = TestActions.two.create(
      {
        name: 'test',
      },
      'test'
    );
    manager.notify(action);

    expect(received).toHaveLength(0);
  });

  test('unsubscribe removes subscription', () => {
    const manager = new SubscriberManager();
    const received: unknown[] = [];

    const unsubscribe = manager.subscribe(TestActions.one, (action) => {
      received.push(action);
    });

    const action = TestActions.one.create(
      {
        value: 1,
      },
      'test'
    );
    manager.notify(action);
    expect(received).toHaveLength(1);

    unsubscribe();

    manager.notify(
      TestActions.one.create(
        {
          value: 2,
        },
        'test'
      )
    );
    expect(received).toHaveLength(1); // Still 1
  });

  test('supports multiple subscribers', () => {
    const manager = new SubscriberManager();
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    manager.subscribe(TestActions.one, (action) => {
      received1.push(action);
    });
    manager.subscribe(TestActions.one, (action) => {
      received2.push(action);
    });

    manager.notify(
      TestActions.one.create(
        {
          value: 1,
        },
        'test'
      )
    );

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  test('handles async handlers', async () => {
    const manager = new SubscriberManager();
    let resolved = false;

    manager.subscribe(TestActions.one, async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });

    const promises = manager.notify(
      TestActions.one.create(
        {
          value: 1,
        },
        'test'
      )
    );
    expect(promises).toHaveLength(1);

    await Promise.all(promises);
    expect(resolved).toBe(true);
  });

  test('handles sync errors gracefully', () => {
    const manager = new SubscriberManager();
    const received: unknown[] = [];

    manager.subscribe(TestActions.one, () => {
      throw new Error('Test error');
    });
    manager.subscribe(TestActions.one, (action) => {
      received.push(action);
    });

    // Should not throw
    manager.notify(
      TestActions.one.create(
        {
          value: 1,
        },
        'test'
      )
    );

    // Second subscriber should still receive
    expect(received).toHaveLength(1);
  });

  test('handles async errors gracefully', async () => {
    const manager = new SubscriberManager();
    let secondHandlerCalled = false;

    manager.subscribe(TestActions.one, async () => {
      await Promise.resolve();
      throw new Error('Async error');
    });
    manager.subscribe(TestActions.one, async () => {
      await Promise.resolve();
      secondHandlerCalled = true;
    });

    const promises = manager.notify(
      TestActions.one.create(
        {
          value: 1,
        },
        'test'
      )
    );

    // Should not throw when awaiting - errors are caught internally
    await Promise.all(promises);

    // Second async handler should still be called
    expect(secondHandlerCalled).toBe(true);
  });

  test('clear removes all subscriptions', () => {
    const manager = new SubscriberManager();

    manager.subscribe(TestActions.one, () => undefined);
    manager.subscribe(TestActions.two, () => undefined);

    expect(manager.size).toBe(2);

    manager.clear();

    expect(manager.size).toBe(0);
  });

  test('size returns subscription count', () => {
    const manager = new SubscriberManager();

    expect(manager.size).toBe(0);

    manager.subscribe(TestActions.one, () => undefined);
    expect(manager.size).toBe(1);

    manager.subscribe(TestActions.two, () => undefined);
    expect(manager.size).toBe(2);
  });

  test('subscribes to array of actions', () => {
    const manager = new SubscriberManager();
    const received: unknown[] = [];

    manager.subscribe([TestActions.one, TestActions.two], (action) => {
      received.push(action);
    });

    manager.notify(
      TestActions.one.create(
        {
          value: 1,
        },
        'test'
      )
    );
    manager.notify(
      TestActions.two.create(
        {
          name: 'test',
        },
        'test'
      )
    );

    expect(received).toHaveLength(2);
  });
});
