import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spy, TestBed } from '@elia/shared';
import { HubConfig } from '@/runtime/config';
import { GenericEventActions, PluginActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { LogRouter } from '@/runtime/logs/log-router';

describe('EventSystem', () => {
  const errorSpy = spy<[string, object?]>();

  beforeEach(() => {
    errorSpy.reset();

    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
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
    const action = GenericEventActions.emit.create(
      {
        type: 'test.event',
        source: 'source',
        payload: { data: 123 },
      },
      'source'
    );

    const dispatched = await events.dispatch(action);

    expect(dispatched.type).toBe('event.emit');
    expect(dispatched.payload.type).toBe('test.event');
    expect(dispatched.payload.source).toBe('source');
    expect(dispatched.id).toBeDefined();
    expect(dispatched.timestamp).toBeGreaterThan(0);
  });

  it('should notify subscribers with matching action creator', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    // Use ActionCreator instead of string pattern
    events.subscribe(GenericEventActions.emit, handler);

    events.dispatch(
      GenericEventActions.emit.create({ type: 'test.one', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      GenericEventActions.emit.create({ type: 'test.two', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      GenericEventActions.emit.create({ type: 'other.event', source: 'src', payload: null }, 'src')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler.callCount).toBe(3);
  });

  it('should support action map for subscribing to multiple actions', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    // Use ActionMap to subscribe to all GenericEventActions
    events.subscribe(GenericEventActions, handler);

    events.dispatch(
      GenericEventActions.emit.create(
        { type: 'motion.detected', source: 'sensor', payload: null },
        'sensor'
      )
    );
    events.dispatch(
      GenericEventActions.emit.create(
        { type: 'motion.stopped', source: 'sensor', payload: null },
        'sensor'
      )
    );
    events.dispatch(
      GenericEventActions.emit.create(
        { type: 'light.on', source: 'switch', payload: null },
        'switch'
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler.callCount).toBe(3);
  });

  it('should unsubscribe correctly', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    const unsub = events.subscribe(GenericEventActions.emit, handler);

    events.dispatch(
      GenericEventActions.emit.create({ type: 'test', source: 'src', payload: null }, 'src')
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler.callCount).toBe(1);

    unsub();

    events.dispatch(
      GenericEventActions.emit.create({ type: 'test', source: 'src', payload: null }, 'src')
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler.callCount).toBe(1); // Still 1, not called again
  });

  it('should notify global subscribers', async () => {
    const events = TestBed.get(EventSystem);
    const globalHandler = spy();
    const patternHandler = spy();

    events.subscribeAll(globalHandler);
    events.subscribe(GenericEventActions.emit, (action) => {
      if (action.payload.type === 'specific') {
        patternHandler(action);
      }
    });

    events.dispatch(
      GenericEventActions.emit.create({ type: 'specific', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      GenericEventActions.emit.create({ type: 'other', source: 'src', payload: null }, 'src')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(globalHandler.callCount).toBe(2);
    expect(patternHandler.callCount).toBe(1);
  });

  it('should store events in ring buffer', async () => {
    const events = TestBed.get(EventSystem);

    events.dispatch(
      GenericEventActions.emit.create({ type: 'event.1', source: 'src', payload: { n: 1 } }, 'src')
    );
    events.dispatch(
      GenericEventActions.emit.create({ type: 'event.2', source: 'src', payload: { n: 2 } }, 'src')
    );
    events.dispatch(
      GenericEventActions.emit.create({ type: 'event.3', source: 'src', payload: { n: 3 } }, 'src')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const history = events.query();

    expect(history.length).toBeGreaterThanOrEqual(3);
    const eventTypes = history.map((e) => e.type);
    expect(eventTypes).toContain('event.emit');
  });

  it('should handle listener errors gracefully', async () => {
    const events = TestBed.get(EventSystem);

    events.subscribe(GenericEventActions.emit, () => {
      throw new Error('Handler crashed!');
    });

    // Should not throw
    expect(() => {
      events.dispatch(
        GenericEventActions.emit.create({ type: 'error.test', source: 'src', payload: null }, 'src')
      );
    }).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 10));
    // Error should be logged (handled by SubscriberManager)
  });

  it('should support array of action creators', async () => {
    const events = TestBed.get(EventSystem);
    const handler = spy();

    // Subscribe to multiple action types
    events.subscribe([GenericEventActions.emit, PluginActions.loaded], handler);

    events.dispatch(
      GenericEventActions.emit.create({ type: 'test', source: 'src', payload: null }, 'src')
    );
    events.dispatch(
      PluginActions.loaded.create({ uid: '123', name: 'test', version: '1.0.0', ref: 'ref' }, 'hub')
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler.callCount).toBe(2);
  });
});
