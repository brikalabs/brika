/**
 * Tests for the `sparks.*` capability handlers.
 *
 * Verifies that dispatching `sparks.register`, `sparks.emit`,
 * `sparks.subscribe`, and `sparks.unsubscribe` through the registry invokes
 * the matching callback with the args payload. Hub -> plugin event delivery
 * (the `sparkEvent` message) is NOT modelled as a capability and is covered
 * by the legacy plugin-process / plugin-lifecycle tests.
 *
 * The `subscribe` capability is special: the registry handler receives the
 * `subscriptionId` and wires up a `sendEvent` closure that delegates to the
 * `sendEvent(subscriptionId, event)` function supplied to
 * `buildSparksCapabilities`. We verify that closure routes correctly.
 */

import { describe, expect, mock, test } from 'bun:test';
import { type CapabilityHandlerContext, CapabilityRegistry } from '@brika/capabilities';
import type { SparkEventType } from '@brika/ipc/contract';
import { buildSparksCapabilities, type SparksCallbacks } from '../sparks';

function makeHandlerCtx(): CapabilityHandlerContext {
  return {
    pluginUid: 'test-plugin',
    pluginRoot: '/tmp/test-plugin',
    grantedScope: {},
    log: () => undefined,
  };
}

function makeCallbacks(overrides: Partial<SparksCallbacks> = {}): SparksCallbacks {
  return {
    onSpark: mock(() => undefined),
    onSparkEmit: mock(() => undefined),
    onSparkSubscribe: mock(() => undefined),
    onSparkUnsubscribe: mock(() => undefined),
    ...overrides,
  };
}

function makeRegistry(
  cb: SparksCallbacks,
  sendEvent: (subscriptionId: string, event: SparkEventType) => void = () => undefined
): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildSparksCapabilities(cb, sendEvent)) {
    reg.register(cap);
  }
  return reg;
}

describe('buildSparksCapabilities — sparks.register', () => {
  test('forwards the local id (and optional schema) to onSpark and returns {}', async () => {
    const onSpark = mock<SparksCallbacks['onSpark']>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onSpark }));

    const result = await reg.dispatch(
      'dev.brika.sparks.register',
      { id: 'temperature.reading', schema: { kind: { type: 'string' } } },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onSpark).toHaveBeenCalledTimes(1);
    expect(onSpark).toHaveBeenCalledWith({
      id: 'temperature.reading',
      schema: { kind: { type: 'string' } },
    });
  });

  test('passes schema as undefined when the args omit it', async () => {
    const onSpark = mock<SparksCallbacks['onSpark']>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onSpark }));

    await reg.dispatch('dev.brika.sparks.register', { id: 'no-schema' }, makeHandlerCtx());

    expect(onSpark).toHaveBeenCalledWith({ id: 'no-schema', schema: undefined });
  });
});

describe('buildSparksCapabilities — sparks.emit', () => {
  test('forwards (sparkId, payload) to onSparkEmit and returns {}', async () => {
    const onSparkEmit = mock<SparksCallbacks['onSparkEmit']>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onSparkEmit }));

    const result = await reg.dispatch(
      'dev.brika.sparks.emit',
      { sparkId: 'temperature.reading', payload: { celsius: 21.5 } },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onSparkEmit).toHaveBeenCalledTimes(1);
    expect(onSparkEmit).toHaveBeenCalledWith('temperature.reading', { celsius: 21.5 });
  });

  test('accepts a null payload (a valid JSON value)', async () => {
    const onSparkEmit = mock<SparksCallbacks['onSparkEmit']>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onSparkEmit }));

    await reg.dispatch(
      'dev.brika.sparks.emit',
      { sparkId: 'pulse', payload: null },
      makeHandlerCtx()
    );

    expect(onSparkEmit).toHaveBeenCalledWith('pulse', null);
  });
});

describe('buildSparksCapabilities — sparks.subscribe', () => {
  test('forwards (sparkType, subscriptionId, sendEvent) to onSparkSubscribe', async () => {
    const onSparkSubscribe = mock<SparksCallbacks['onSparkSubscribe']>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onSparkSubscribe }));

    const result = await reg.dispatch(
      'dev.brika.sparks.subscribe',
      { sparkType: '@brika/weather:rain', subscriptionId: 'sub-1' },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onSparkSubscribe).toHaveBeenCalledTimes(1);
    const call = onSparkSubscribe.mock.calls[0];
    expect(call).toBeDefined();
    expect(call?.[0]).toBe('@brika/weather:rain');
    expect(call?.[1]).toBe('sub-1');
    expect(typeof call?.[2]).toBe('function');
  });

  test('sendEvent closure delegates to the outer sendEvent with the correct subscriptionId', async () => {
    let capturedSend: ((event: SparkEventType) => void) | undefined;
    const onSparkSubscribe = mock<SparksCallbacks['onSparkSubscribe']>((_type, _id, sendEvent) => {
      capturedSend = sendEvent;
    });
    const outerSend = mock<(subscriptionId: string, event: SparkEventType) => void>(
      () => undefined
    );
    const reg = makeRegistry(makeCallbacks({ onSparkSubscribe }), outerSend);

    await reg.dispatch(
      'dev.brika.sparks.subscribe',
      { sparkType: '@brika/weather:rain', subscriptionId: 'sub-7' },
      makeHandlerCtx()
    );

    expect(capturedSend).toBeDefined();
    const event: SparkEventType = {
      type: '@brika/weather:rain',
      payload: { mm: 12 },
      source: '@brika/weather',
      ts: 1_700_000_000_000,
      id: 'evt-1',
    };
    capturedSend?.(event);

    expect(outerSend).toHaveBeenCalledTimes(1);
    expect(outerSend).toHaveBeenCalledWith('sub-7', event);
  });
});

describe('buildSparksCapabilities — sparks.unsubscribe', () => {
  test('forwards the subscriptionId to onSparkUnsubscribe and returns {}', async () => {
    const onSparkUnsubscribe = mock<SparksCallbacks['onSparkUnsubscribe']>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onSparkUnsubscribe }));

    const result = await reg.dispatch(
      'dev.brika.sparks.unsubscribe',
      { subscriptionId: 'sub-9' },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onSparkUnsubscribe).toHaveBeenCalledTimes(1);
    expect(onSparkUnsubscribe).toHaveBeenCalledWith('sub-9');
  });
});

describe('buildSparksCapabilities — invalid args', () => {
  test('sparks.emit rejects a missing sparkId with INVALID_ARGS', async () => {
    const cb = makeCallbacks();
    const reg = makeRegistry(cb);

    await expect(
      reg.dispatch('dev.brika.sparks.emit', { payload: { foo: 1 } }, makeHandlerCtx())
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(cb.onSparkEmit).not.toHaveBeenCalled();
  });
});

describe('buildSparksCapabilities — registration shape', () => {
  test('registers exactly the four sparks.* capabilities', () => {
    const caps = buildSparksCapabilities(makeCallbacks(), () => undefined);
    const ids = caps.map((c) => c.spec.id).sort();
    expect(ids).toEqual([
      'dev.brika.sparks.emit',
      'dev.brika.sparks.register',
      'dev.brika.sparks.subscribe',
      'dev.brika.sparks.unsubscribe',
    ]);
  });

  test('every spec gates on the "sparks" permission', () => {
    const caps = buildSparksCapabilities(makeCallbacks(), () => undefined);
    for (const cap of caps) {
      expect(cap.spec.permission?.name).toBe('sparks');
    }
  });
});
