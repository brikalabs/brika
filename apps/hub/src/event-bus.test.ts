import 'reflect-metadata';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { waitFor } from '@brika/testing';
import { HubConfig } from '@/runtime/config';
import { PluginActions, SparkActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({
  autoStub: false,
});

describe('EventSystem', () => {
  const errorSpy = mock();

  beforeEach(() => {
    errorSpy.mockReset();
    provide(HubConfig, new HubConfig());
    stub(Logger, {
      withSource: () => ({
        error: errorSpy,
      }),
    });
  });

  it('should dispatch events', async () => {
    const events = get(EventSystem);
    const action = SparkActions.emit.create(
      {
        type: 'test.event',
        source: 'source',
        payload: {
          data: 123,
        },
      },
      'source'
    );

    const dispatched = await events.dispatch(action);

    expect(dispatched.type).toBe('spark.emit');
    expect(dispatched.payload.type).toBe('test.event');
    expect(dispatched.payload.source).toBe('source');
    expect(dispatched.id).toBeDefined();
    expect(dispatched.timestamp).toBeGreaterThan(0);
  });

  it('should notify subscribers with matching action creator', async () => {
    const events = get(EventSystem);
    const handler = mock();

    // Use ActionCreator instead of string pattern
    events.subscribe(SparkActions.emit, handler);

    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'test.one',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'test.two',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'other.event',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );

    await waitFor(() => handler.mock.calls.length === 3);

    expect(handler.mock.calls.length).toBe(3);
  });

  it('should support action map for subscribing to multiple actions', async () => {
    const events = get(EventSystem);
    const handler = mock();

    // Use ActionMap to subscribe to all SparkActions
    events.subscribe(SparkActions, handler);

    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'motion.detected',
          source: 'sensor',
          payload: null,
        },
        'sensor'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'motion.stopped',
          source: 'sensor',
          payload: null,
        },
        'sensor'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'light.on',
          source: 'switch',
          payload: null,
        },
        'switch'
      )
    );

    await waitFor(() => handler.mock.calls.length === 3);

    expect(handler.mock.calls.length).toBe(3);
  });

  it('should unsubscribe correctly', async () => {
    const events = get(EventSystem);
    const handler = mock();

    const unsub = events.subscribe(SparkActions.emit, handler);

    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'test',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );
    await waitFor(() => handler.mock.calls.length === 1);
    expect(handler.mock.calls.length).toBe(1);

    unsub();

    const dispatched = events.dispatch(
      SparkActions.emit.create(
        {
          type: 'test',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );
    // Negative assertion — the unsubscribed handler must not fire even
    // after the dispatch has fully settled.
    await dispatched;
    expect(handler.mock.calls.length).toBe(1);
  });

  it('should notify global subscribers', async () => {
    const events = get(EventSystem);
    const globalHandler = mock();
    const patternHandler = mock();

    events.subscribeAll(globalHandler);
    events.subscribe(SparkActions.emit, (action) => {
      if (action.payload.type === 'specific') {
        patternHandler(action);
      }
    });

    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'specific',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'other',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );

    await waitFor(
      () => globalHandler.mock.calls.length === 2 && patternHandler.mock.calls.length === 1
    );

    expect(globalHandler.mock.calls.length).toBe(2);
    expect(patternHandler.mock.calls.length).toBe(1);
  });

  it('should store events in ring buffer', async () => {
    const events = get(EventSystem);

    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'event.1',
          source: 'src',
          payload: {
            n: 1,
          },
        },
        'src'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'event.2',
          source: 'src',
          payload: {
            n: 2,
          },
        },
        'src'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'event.3',
          source: 'src',
          payload: {
            n: 3,
          },
        },
        'src'
      )
    );

    await waitFor(() => events.query().length >= 3);

    const history = events.query();

    expect(history.length).toBeGreaterThanOrEqual(3);
    const eventTypes = history.map((e) => e.type);
    expect(eventTypes).toContain('spark.emit');
  });

  it('should handle listener errors gracefully', async () => {
    const events = get(EventSystem);

    events.subscribe(SparkActions.emit, () => {
      throw new Error('Handler crashed!');
    });

    let dispatched: Promise<unknown> | undefined;
    // Should not throw
    expect(() => {
      dispatched = events.dispatch(
        SparkActions.emit.create(
          {
            type: 'error.test',
            source: 'src',
            payload: null,
          },
          'src'
        )
      );
    }).not.toThrow();

    // Awaiting the dispatch lets the error path settle (logged through
    // SubscriberManager) before the test exits.
    await dispatched;
  });

  it('should support array of action creators', async () => {
    const events = get(EventSystem);
    const handler = mock();

    // Subscribe to multiple action types
    events.subscribe([SparkActions.emit, PluginActions.loaded], handler);

    events.dispatch(
      SparkActions.emit.create(
        {
          type: 'test',
          source: 'src',
          payload: null,
        },
        'src'
      )
    );
    events.dispatch(
      PluginActions.loaded.create(
        {
          uid: '123',
          name: 'test',
          version: '1.0.0',
          pid: 1234,
        },
        'hub'
      )
    );

    await waitFor(() => handler.mock.calls.length === 2);

    expect(handler.mock.calls.length).toBe(2);
  });
});
