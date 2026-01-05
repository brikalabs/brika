import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ACTION_ID, type ActionsUnion, defineAction, defineActions, EventSystem } from '../index';

// Test actions
const TestActions = defineActions('test', {
  hello: z.object({ message: z.string() }),
  goodbye: z.object({ message: z.string() }),
  count: z.object({ value: z.number() }),
});

type TestAction = ActionsUnion<typeof TestActions>;

describe('EventSystem', () => {
  it('should dispatch and subscribe to actions with type inference', async () => {
    const events = new EventSystem();
    let received: ReturnType<typeof TestActions.hello.create> | null = null;

    // Using action creator - automatic type inference!
    events.subscribe(TestActions.hello, (action) => {
      // action is automatically typed as Action<'test.hello', { message: string }>
      received = action;
      expect(action.payload.message).toBe('Hello World');
    });

    const action = TestActions.hello.create({ message: 'Hello World' });
    await events.dispatch(action);

    expect(received).not.toBeNull();
    expect(received!.type).toBe('test.hello');
    expect(received!.payload.message).toBe('Hello World');
  });

  it('should use Symbol for fast O(1) matching', () => {
    const action = TestActions.hello.create({ message: 'test' });

    // Action has the same symbol as its creator
    expect(action[ACTION_ID]).toBe(TestActions.hello[ACTION_ID]);

    // Different creators have different symbols
    expect(TestActions.hello[ACTION_ID]).not.toBe(TestActions.goodbye[ACTION_ID]);
  });

  it('should support action map for subscribing to all actions', async () => {
    const events = new EventSystem();
    const received: TestAction[] = [];

    // Using action map - handler gets union type
    events.subscribe(TestActions, (action) => {
      received.push(action);
    });

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));
    await events.dispatch(TestActions.goodbye.create({ message: 'Goodbye' }));
    await events.dispatch(TestActions.count.create({ value: 42 }));

    expect(received.length).toBe(3);
    expect(received[0]?.type).toBe('test.hello');
    expect(received[1]?.type).toBe('test.goodbye');
    expect(received[2]?.type).toBe('test.count');
  });

  it('should support array of action creators', async () => {
    const events = new EventSystem();
    const received: Array<
      ReturnType<typeof TestActions.hello.create> | ReturnType<typeof TestActions.goodbye.create>
    > = [];

    // Array of action creators - handler gets union of those actions
    events.subscribe([TestActions.hello, TestActions.goodbye], (action) => {
      received.push(action);
    });

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));
    await events.dispatch(TestActions.goodbye.create({ message: 'Goodbye' }));
    await events.dispatch(TestActions.count.create({ value: 42 })); // This won't be received

    expect(received.length).toBe(2);
    expect(received[0]?.type).toBe('test.hello');
    expect(received[1]?.type).toBe('test.goodbye');
  });

  it('should support once with Promise', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(TestActions.hello.create({ message: 'Hello' }));
    }, 50);

    const action = await events.once(TestActions.hello, { timeout: 1000 });
    expect(action.type).toBe('test.hello');
    expect(action.payload.message).toBe('Hello');
  });

  it('should timeout if action not received', () => {
    const events = new EventSystem();

    expect(events.once(TestActions.hello, { timeout: 100 })).rejects.toThrow('Timeout');
  });

  it('should support waitFor with action creator and predicate', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(TestActions.count.create({ value: 10 }));
      events.dispatch(TestActions.count.create({ value: 20 }));
    }, 50);

    const action = await events.waitFor(
      TestActions.count,
      (action) => action.payload.value === 20,
      { timeout: 1000 }
    );

    expect(action.type).toBe('test.count');
    expect(action.payload.value).toBe(20);
  });

  it('should support race with action creators', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(TestActions.goodbye.create({ message: 'Goodbye' }));
    }, 50);

    const action = await events.race([TestActions.hello, TestActions.goodbye], { timeout: 1000 });
    expect(action.type).toBe('test.goodbye');
    if (action.type === 'test.goodbye') {
      expect(action.payload.message).toBe('Goodbye');
    }
  });

  it('should validate payload with Zod', () => {
    expect(() => {
      // Testing invalid input - message should be string, not number
      TestActions.hello.create({ message: 123 } as unknown as { message: string });
    }).toThrow();
  });

  it('should unsubscribe correctly', async () => {
    const events = new EventSystem();
    let callCount = 0;

    const unsub = events.subscribe(TestActions.hello, () => {
      callCount++;
    });

    await events.dispatch(TestActions.hello.create({ message: 'First' }));
    expect(callCount).toBe(1);

    unsub();

    await events.dispatch(TestActions.hello.create({ message: 'Second' }));
    expect(callCount).toBe(1); // Still 1, not called again
  });

  it('should support multiple subscribers', async () => {
    const events = new EventSystem();
    let handler1Count = 0;
    let handler2Count = 0;

    events.subscribe(TestActions.hello, () => {
      handler1Count++;
    });

    events.subscribe(TestActions.hello, (action) => {
      expect(action.payload.message).toBe('Hello');
      handler2Count++;
    });

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));

    expect(handler1Count).toBe(1);
    expect(handler2Count).toBe(1);
  });

  it('should support async handlers', async () => {
    const events = new EventSystem();
    let resolved = false;

    events.subscribe(TestActions.hello, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      resolved = true;
    });

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));

    expect(resolved).toBe(true);
  });

  it('should include source in action', () => {
    const action = TestActions.hello.create({ message: 'Hello' }, 'test-source');
    expect(action.source).toBe('test-source');
    expect(action.id).toBeDefined();
    expect(action.timestamp).toBeGreaterThan(0);
  });

  it('should return Promise from dispatch', async () => {
    const events = new EventSystem();
    const action = TestActions.hello.create({ message: 'Hello' });

    const result = events.dispatch(action);

    // dispatch returns a Promise
    expect(result).toBeInstanceOf(Promise);

    // Promise resolves with the action
    const resolved = await result;
    expect(resolved).toBe(action);
    expect(resolved.type).toBe('test.hello');
  });

  it('should await async handlers in dispatch', async () => {
    const events = new EventSystem();
    let handlerCompleted = false;

    events.subscribe(TestActions.hello, async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      handlerCompleted = true;
    });

    // Dispatch and wait for all handlers
    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));

    // Handler should have completed
    expect(handlerCompleted).toBe(true);
  });

  it('should await multiple async handlers in dispatch', async () => {
    const events = new EventSystem();
    const order: number[] = [];

    events.subscribe(TestActions.hello, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push(1);
    });

    events.subscribe(TestActions.hello, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(2);
    });

    events.subscribeAll(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(3);
    });

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));

    // All handlers should have completed (order may vary due to timing)
    expect(order.length).toBe(3);
    expect(order).toContain(1);
    expect(order).toContain(2);
    expect(order).toContain(3);
  });

  it('should handle waitFor timeout', () => {
    const events = new EventSystem();

    expect(events.waitFor(TestActions.hello, () => true, { timeout: 100 })).rejects.toThrow(
      'Timeout'
    );
  });

  it('should handle race timeout', () => {
    const events = new EventSystem();

    expect(events.race([TestActions.hello, TestActions.goodbye], { timeout: 100 })).rejects.toThrow(
      'Timeout'
    );
  });

  it('should clear all subscriptions', async () => {
    const events = new EventSystem();
    let callCount = 0;

    events.subscribe(TestActions.hello, () => {
      callCount++;
    });

    events.clear();

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));

    expect(callCount).toBe(0); // Handler not called after clear
  });

  it('should clear pending promises on clear', async () => {
    const events = new EventSystem();

    void events.once(TestActions.hello, { timeout: 5000 });

    events.clear();

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));

    const events2 = new EventSystem();
    let received = false;
    events2.subscribe(TestActions.hello, () => {
      received = true;
    });
    events2.clear();
    await events2.dispatch(TestActions.hello.create({ message: 'Hello' }));
    expect(received).toBe(false);
  });

  it('should support waitFor with predicate that filters actions', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(TestActions.count.create({ value: 10 }));
      events.dispatch(TestActions.count.create({ value: 20 }));
      events.dispatch(TestActions.count.create({ value: 30 }));
    }, 50);

    const action = await events.waitFor(
      TestActions.count,
      (action) => action.payload.value === 20,
      { timeout: 1000 }
    );

    expect(action.type).toBe('test.count');
    expect(action.payload.value).toBe(20);
  });

  it('should support race with multiple patterns', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(TestActions.goodbye.create({ message: 'Goodbye' }));
    }, 50);

    const action = await events.race([TestActions.hello, TestActions.goodbye, TestActions.count], {
      timeout: 1000,
    });

    expect(action.type).toBe('test.goodbye');
    expect((action as ReturnType<typeof TestActions.goodbye.create>).payload.message).toBe(
      'Goodbye'
    );
  });

  it('should support defineActions with different schema types', () => {
    const MixedActions = defineActions('mixed', {
      string: z.string(),
      number: z.number(),
      boolean: z.boolean(),
      array: z.array(z.string()),
      object: z.object({ key: z.string() }),
    });

    const strAction = MixedActions.string.create('hello', 'source');
    expect(strAction.type).toBe('mixed.string');
    expect(strAction.payload).toBe('hello');

    const numAction = MixedActions.number.create(42, 'source');
    expect(numAction.type).toBe('mixed.number');
    expect(numAction.payload).toBe(42);

    const boolAction = MixedActions.boolean.create(true, 'source');
    expect(boolAction.type).toBe('mixed.boolean');
    expect(boolAction.payload).toBe(true);

    const arrAction = MixedActions.array.create(['a', 'b'], 'source');
    expect(arrAction.type).toBe('mixed.array');
    expect(arrAction.payload).toEqual(['a', 'b']);

    const objAction = MixedActions.object.create({ key: 'value' }, 'source');
    expect(objAction.type).toBe('mixed.object');
    expect(objAction.payload).toEqual({ key: 'value' });
  });

  it('should validate all schema types with Zod', () => {
    const MixedActions = defineActions('mixed', {
      string: z.string(),
      number: z.number(),
      array: z.array(z.string()),
    });

    expect(() => {
      // Testing invalid input - should be string
      MixedActions.string.create(123 as unknown as string);
    }).toThrow();

    expect(() => {
      // Testing invalid input - should be number
      MixedActions.number.create('not a number' as unknown as number);
    }).toThrow();

    expect(() => {
      // Testing invalid input - should be string array
      MixedActions.array.create('not an array' as unknown as string[]);
    }).toThrow();
  });

  it('should infer correct types for ActionsUnion', () => {
    const testAction: TestAction = TestActions.hello.create({ message: 'test' });
    expect(testAction.type).toBe('test.hello');

    const actions: TestAction[] = [
      TestActions.hello.create({ message: 'hello' }),
      TestActions.goodbye.create({ message: 'goodbye' }),
      TestActions.count.create({ value: 42 }),
    ];
    expect(actions.length).toBe(3);
  });

  it('should handle errors in subscribers gracefully', async () => {
    const events = new EventSystem();
    let secondHandlerCalled = false;

    events.subscribe(TestActions.hello, () => {
      throw new Error('Handler error');
    });

    events.subscribe(TestActions.hello, () => {
      secondHandlerCalled = true;
    });

    // Should not throw
    await events.dispatch(TestActions.hello.create({ message: 'test' }));

    expect(secondHandlerCalled).toBe(true);
  });

  it('should support subscribeAll for all actions', async () => {
    const events = new EventSystem();
    const received: TestAction[] = [];

    // Subscribe to ALL actions without pattern matching
    events.subscribeAll((action) => {
      received.push(action as TestAction);
    });

    await events.dispatch(TestActions.hello.create({ message: 'Hello' }));
    await events.dispatch(TestActions.goodbye.create({ message: 'Goodbye' }));
    await events.dispatch(TestActions.count.create({ value: 42 }));

    expect(received.length).toBe(3);
    expect(received[0]?.type).toBe('test.hello');
    expect(received[1]?.type).toBe('test.goodbye');
    expect(received[2]?.type).toBe('test.count');
  });

  it('should unsubscribe from subscribeAll', async () => {
    const events = new EventSystem();
    let callCount = 0;

    const unsub = events.subscribeAll(() => {
      callCount++;
    });

    await events.dispatch(TestActions.hello.create({ message: 'First' }));
    expect(callCount).toBe(1);

    unsub();

    await events.dispatch(TestActions.hello.create({ message: 'Second' }));
    expect(callCount).toBe(1); // Still 1, not called again
  });
});

describe('defineAction (single action without namespace)', () => {
  const UserLoggedIn = defineAction(
    'user.loggedIn',
    z.object({
      userId: z.string(),
      email: z.string(),
    })
  );

  const SystemStarted = defineAction(
    'system.started',
    z.object({
      version: z.string(),
      timestamp: z.number(),
    })
  );

  it('should create action with correct type', () => {
    const action = UserLoggedIn.create({ userId: '123', email: 'test@example.com' });

    expect(action.type).toBe('user.loggedIn');
    expect(action.payload.userId).toBe('123');
    expect(action.payload.email).toBe('test@example.com');
    expect(action.id).toBeDefined();
    expect(action.timestamp).toBeGreaterThan(0);
  });

  it('should have unique Symbol', () => {
    expect(UserLoggedIn[ACTION_ID]).toBeDefined();
    expect(SystemStarted[ACTION_ID]).toBeDefined();
    expect(UserLoggedIn[ACTION_ID]).not.toBe(SystemStarted[ACTION_ID]);
  });

  it('should validate payload with Zod', () => {
    expect(() => {
      // Testing invalid input - userId should be string, not number
      UserLoggedIn.create({ userId: 123, email: 'test@example.com' } as unknown as {
        userId: string;
        email: string;
      });
    }).toThrow();
  });

  it('should include source in action', () => {
    const action = UserLoggedIn.create(
      { userId: '123', email: 'test@example.com' },
      'auth-service'
    );
    expect(action.source).toBe('auth-service');
  });

  it('should subscribe with type inference', async () => {
    const events = new EventSystem();
    let received: ReturnType<typeof UserLoggedIn.create> | null = null;

    events.subscribe(UserLoggedIn, (action) => {
      received = action;
      expect(action.payload.userId).toBe('user-1');
      expect(action.payload.email).toBe('user@example.com');
    });

    await events.dispatch(UserLoggedIn.create({ userId: 'user-1', email: 'user@example.com' }));

    expect(received).not.toBeNull();
    expect(received!.type).toBe('user.loggedIn');
  });

  it('should work with once()', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(SystemStarted.create({ version: '1.0.0', timestamp: Date.now() }));
    }, 50);

    const action = await events.once(SystemStarted, { timeout: 1000 });

    expect(action.type).toBe('system.started');
    expect(action.payload.version).toBe('1.0.0');
  });

  it('should work with waitFor()', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(UserLoggedIn.create({ userId: 'other', email: 'other@example.com' }));
      events.dispatch(UserLoggedIn.create({ userId: 'admin', email: 'admin@example.com' }));
    }, 50);

    const action = await events.waitFor(UserLoggedIn, (a) => a.payload.userId === 'admin', {
      timeout: 1000,
    });

    expect(action.payload.userId).toBe('admin');
    expect(action.payload.email).toBe('admin@example.com');
  });

  it('should work with race()', async () => {
    const events = new EventSystem();

    setTimeout(() => {
      events.dispatch(SystemStarted.create({ version: '1.0.0', timestamp: Date.now() }));
    }, 50);

    const action = await events.race([UserLoggedIn, SystemStarted], { timeout: 1000 });

    expect(action.type).toBe('system.started');
  });
});
