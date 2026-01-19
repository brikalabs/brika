import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spy, TestBed } from '@brika/shared';
import { HubConfig } from '@/runtime/config';
import { PluginActions, SparkActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';

describe('EventSystem', () => {
  const errorSpy = spy<[string, object?]>();

  beforeEach(() => {
    errorSpy.reset();

    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(Logger, {
        info: spy(),
        error: errorSpy,
        warn: spy(),
        debug: spy(),
      })
      .compile();
  });

  afterEach(() => TestBed.reset());

  it('should dispatch events', async () => {
    const events = TestBed.get(EventSystem);
    const action = SparkActions.emit.create(
      {
        type: 'test.event',
        source: 'source',
        payload: { data: 123 },
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
    const events = TestBed.get(EventSystem);
    const handler = spy();

    // Use ActionCreator instead of string pattern
    events.subscribe(SparkActions.emit, handler);

    events.dispatch(
      SparkActions.emit.create({ type: 'test.one', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      SparkActions.emit.create({ type: 'test.two', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      SparkActions.emit.create({ type: 'other.event', source: 'src', payload: null }, 'src')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler.callCount).toBe(3);
  });

  it('should support action map for subscribing to multiple actions', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    // Use ActionMap to subscribe to all SparkActions
    events.subscribe(SparkActions, handler);

    events.dispatch(
      SparkActions.emit.create(
        { type: 'motion.detected', source: 'sensor', payload: null },
        'sensor'
      )
    );
    events.dispatch(
      SparkActions.emit.create(
        { type: 'motion.stopped', source: 'sensor', payload: null },
        'sensor'
      )
    );
    events.dispatch(
      SparkActions.emit.create({ type: 'light.on', source: 'switch', payload: null }, 'switch')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler.callCount).toBe(3);
  });

  it('should unsubscribe correctly', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    const unsub = events.subscribe(SparkActions.emit, handler);

    events.dispatch(
      SparkActions.emit.create({ type: 'test', source: 'src', payload: null }, 'src')
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler.callCount).toBe(1);

    unsub();

    events.dispatch(
      SparkActions.emit.create({ type: 'test', source: 'src', payload: null }, 'src')
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler.callCount).toBe(1); // Still 1, not called again
  });

  it('should notify global subscribers', async () => {
    const events = TestBed.get(EventSystem);
    const globalHandler = spy();
    const patternHandler = spy();

    events.subscribeAll(globalHandler);
    events.subscribe(SparkActions.emit, (action) => {
      if (action.payload.type === 'specific') {
        patternHandler(action);
      }
    });

    events.dispatch(
      SparkActions.emit.create({ type: 'specific', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      SparkActions.emit.create({ type: 'other', source: 'src', payload: null }, 'src')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(globalHandler.callCount).toBe(2);
    expect(patternHandler.callCount).toBe(1);
  });

  it('should store events in ring buffer', async () => {
    const events = TestBed.get(EventSystem);

    events.dispatch(
      SparkActions.emit.create({ type: 'event.1', source: 'src', payload: { n: 1 } }, 'src')
    );
    events.dispatch(
      SparkActions.emit.create({ type: 'event.2', source: 'src', payload: { n: 2 } }, 'src')
    );
    events.dispatch(
      SparkActions.emit.create({ type: 'event.3', source: 'src', payload: { n: 3 } }, 'src')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const history = events.query();

    expect(history.length).toBeGreaterThanOrEqual(3);
    const eventTypes = history.map((e) => e.type);
    expect(eventTypes).toContain('spark.emit');
  });

  it('should handle listener errors gracefully', async () => {
    const events = TestBed.get(EventSystem);

    events.subscribe(SparkActions.emit, () => {
      throw new Error('Handler crashed!');
    });

    // Should not throw
    expect(() => {
      events.dispatch(
        SparkActions.emit.create({ type: 'error.test', source: 'src', payload: null }, 'src')
      );
    }).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 10));
    // Error should be logged (handled by SubscriberManager)
  });

  it('should support array of action creators', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    // Subscribe to multiple action types
    events.subscribe([SparkActions.emit, PluginActions.loaded], handler);

    events.dispatch(
      SparkActions.emit.create({ type: 'test', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      PluginActions.loaded.create({ uid: '123', name: 'test', version: '1.0.0', pid: 1234 }, 'hub')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler.callCount).toBe(2);
  });
});
