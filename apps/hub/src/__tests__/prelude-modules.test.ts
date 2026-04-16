/**
 * Prelude Module Unit Tests
 *
 * Tests each prelude module in isolation using a real Channel
 * wired to a captured `sent` array. RPCs are triggered via
 * `channel.handle()` to simulate hub-side messages.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Channel, type WireMessage } from '@brika/ipc';
import {
  blockEmit,
  callAction,
  emitSpark,
  getHubLocation,
  getHubTimezone,
  preferenceOptions,
  preferences,
  pushBrickData,
  pushInput,
  registerAction,
  registerBlock,
  registerBrickType,
  registerRoute,
  registerSpark,
  routeRequest,
  sparkEvent,
  startBlock,
  stopBlock,
  subscribeSpark,
  uninstall,
  unsubscribeSpark,
  updateBrickConfig,
  updatePreference,
} from '@brika/ipc/contract';
import { setupActions } from '@/runtime/plugins/prelude/actions';
import { type RegisterBlockSpec, setupBlocks } from '@/runtime/plugins/prelude/blocks';
import { setupBricks } from '@/runtime/plugins/prelude/bricks';
import { setupLifecycle } from '@/runtime/plugins/prelude/lifecycle';
import { setupLocation } from '@/runtime/plugins/prelude/location';
import { setupRoutes } from '@/runtime/plugins/prelude/routes';
import { setupSparks } from '@/runtime/plugins/prelude/sparks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTestChannel() {
  const sent: WireMessage[] = [];
  const channel = new Channel({
    send: (msg) => sent.push(msg),
    defaultTimeoutMs: 500,
  });
  return { channel, sent };
}

/** Trigger an implemented RPC and return the result from the sent array. */
async function triggerRpc(
  channel: Channel,
  sent: WireMessage[],
  name: string,
  payload: Record<string, unknown>,
  id = 1
) {
  await channel.handle({ t: name, _id: id, ...payload });
  const response = sent.find(
    (m) => m.t === `${name}Result` && (m as Record<string, unknown>)._id === id
  );
  return (response as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
}

/** Trigger a message handler */
async function triggerMessage(channel: Channel, name: string, payload: Record<string, unknown>) {
  await channel.handle({ t: name, ...payload });
}

const logMock = mock() as ReturnType<typeof mock> & ((level: string, message: string) => void);

// ─── Actions ──────────────────────────────────────────────────────────────────

describe('Prelude Actions', () => {
  let channel: Channel;
  let sent: WireMessage[];

  beforeEach(() => {
    ({ channel, sent } = createTestChannel());
  });

  test('registerAction sends registration message', () => {
    const actions = setupActions(channel);
    actions.registerAction('myAction', () => 'ok');

    const msg = sent.find((m) => m.t === registerAction.name);
    expect(msg).toBeDefined();
    expect((msg as Record<string, unknown>).id).toBe('myAction');
  });

  test('callAction RPC invokes registered handler', async () => {
    const actions = setupActions(channel);
    actions.registerAction('greet', (input) => {
      const data = input as Record<string, string>;
      return { greeting: `Hello ${data.name}` };
    });

    const result = await triggerRpc(channel, sent, callAction.name, {
      actionId: 'greet',
      input: { name: 'World' },
    });

    expect(result).toEqual({ ok: true, data: { greeting: 'Hello World' } });
  });

  test('callAction RPC returns error for unknown action', async () => {
    setupActions(channel);

    const result = await triggerRpc(channel, sent, callAction.name, {
      actionId: 'nope',
      input: undefined,
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('nope') });
  });

  test('callAction RPC catches handler errors', async () => {
    const actions = setupActions(channel);
    actions.registerAction('fail', () => {
      throw new Error('boom');
    });

    const result = await triggerRpc(channel, sent, callAction.name, {
      actionId: 'fail',
      input: undefined,
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('boom') });
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

describe('Prelude Routes', () => {
  let channel: Channel;
  let sent: WireMessage[];

  beforeEach(() => {
    ({ channel, sent } = createTestChannel());
  });

  test('registerRoute sends registration message', () => {
    const routes = setupRoutes(channel);
    routes.registerRoute('GET', '/hello', () => ({ status: 200 }));

    const msg = sent.find((m) => m.t === registerRoute.name);
    expect(msg).toBeDefined();
    expect((msg as Record<string, unknown>).method).toBe('GET');
    expect((msg as Record<string, unknown>).path).toBe('/hello');
  });

  test('routeRequest RPC dispatches to registered handler', async () => {
    const routes = setupRoutes(channel);
    routes.registerRoute('POST', '/data', (req) => ({
      status: 200,
      body: { received: req.body },
    }));

    const result = await triggerRpc(channel, sent, routeRequest.name, {
      routeId: 'POST:/data',
      method: 'POST',
      path: '/data',
      query: {},
      headers: {},
      body: { foo: 'bar' },
    });

    expect(result).toEqual({ status: 200, body: { received: { foo: 'bar' } } });
  });

  test('routeRequest returns 404 for unknown route', async () => {
    setupRoutes(channel);

    const result = await triggerRpc(channel, sent, routeRequest.name, {
      routeId: 'GET:/missing',
      method: 'GET',
      path: '/missing',
      query: {},
      headers: {},
    });

    expect(result).toMatchObject({ status: 404 });
  });

  test('routeRequest returns 500 when handler throws', async () => {
    const routes = setupRoutes(channel);
    routes.registerRoute('GET', '/fail', () => {
      throw new Error('route boom');
    });

    const result = await triggerRpc(channel, sent, routeRequest.name, {
      routeId: 'GET:/fail',
      method: 'GET',
      path: '/fail',
      query: {},
      headers: {},
    });

    expect(result).toMatchObject({ status: 500 });
  });
});

// ─── Location ─────────────────────────────────────────────────────────────────

/**
 * Create a pair of channels wired together (plugin <-> hub).
 * Messages sent by one are handled by the other.
 */
function createChannelPair() {
  let pluginChannel: Channel;
  let hubChannel: Channel;

  pluginChannel = new Channel({
    send: (msg) => hubChannel.handle(msg),
    defaultTimeoutMs: 500,
  });
  hubChannel = new Channel({
    send: (msg) => pluginChannel.handle(msg),
    defaultTimeoutMs: 500,
  });

  return { pluginChannel, hubChannel };
}

describe('Prelude Location', () => {
  test('getLocation fetches and caches result', async () => {
    const { pluginChannel, hubChannel } = createChannelPair();
    const loc = setupLocation(pluginChannel);

    hubChannel.implement(getHubLocation, () => ({
      location: {
        latitude: 46.2,
        longitude: 6.15,
        street: '1 Rue',
        city: 'Geneva',
        state: 'GE',
        postalCode: '1200',
        country: 'Switzerland',
        countryCode: 'CH',
        formattedAddress: '1 Rue, Geneva',
      },
    }));

    const result = await loc.getLocation();
    expect(result).toMatchObject({ city: 'Geneva' });

    // Second call uses cache (no new RPC)
    const cached = await loc.getLocation();
    expect(cached).toMatchObject({ city: 'Geneva' });
  });

  test('getTimezone fetches and caches result', async () => {
    const { pluginChannel, hubChannel } = createChannelPair();
    const loc = setupLocation(pluginChannel);

    hubChannel.implement(getHubTimezone, () => ({ timezone: 'Europe/Zurich' }));

    const tz = await loc.getTimezone();
    expect(tz).toBe('Europe/Zurich');

    // Cache hit
    const cached = await loc.getTimezone();
    expect(cached).toBe('Europe/Zurich');
  });

  test('invalidateTimezone clears cache', async () => {
    const { pluginChannel, hubChannel } = createChannelPair();
    const loc = setupLocation(pluginChannel);

    let callCount = 0;
    hubChannel.implement(getHubTimezone, () => {
      callCount++;
      return { timezone: callCount === 1 ? 'Asia/Tokyo' : 'US/Pacific' };
    });

    expect(await loc.getTimezone()).toBe('Asia/Tokyo');

    loc.invalidateTimezone();
    expect(await loc.getTimezone()).toBe('US/Pacific');
    expect(callCount).toBe(2);
  });
});

// ─── Sparks ───────────────────────────────────────────────────────────────────

describe('Prelude Sparks', () => {
  const declaredSparks = new Set(['weather', 'alert']);
  let channel: Channel;
  let sent: WireMessage[];

  beforeEach(() => {
    logMock.mockClear();
    ({ channel, sent } = createTestChannel());
  });

  test('registerSpark validates against manifest', () => {
    const sparks = setupSparks(channel, logMock, declaredSparks);

    expect(() => sparks.registerSpark('unknown')).toThrow('not in package.json');
  });

  test('registerSpark sends registration message', () => {
    const sparks = setupSparks(channel, logMock, declaredSparks);
    sparks.registerSpark('weather', { temp: { type: 'number' } });

    const msg = sent.find((m) => m.t === registerSpark.name) as Record<string, unknown>;
    expect(msg).toBeDefined();
    expect((msg.spark as Record<string, unknown>).id).toBe('weather');
  });

  test('registerSpark rejects duplicate registration', () => {
    const sparks = setupSparks(channel, logMock, declaredSparks);
    sparks.registerSpark('weather');

    expect(() => sparks.registerSpark('weather')).toThrow('already registered');
  });

  test('emitSpark sends message', () => {
    const sparks = setupSparks(channel, logMock, declaredSparks);
    sparks.emitSpark('weather', { temp: 20 });

    const msg = sent.find((m) => m.t === emitSpark.name) as Record<string, unknown>;
    expect(msg).toBeDefined();
    expect(msg.sparkId).toBe('weather');
    expect(msg.payload).toEqual({ temp: 20 });
  });

  test('subscribeSpark routes events and can unsubscribe', async () => {
    const sparks = setupSparks(channel, logMock, declaredSparks);
    const handler = mock();

    const unsub = sparks.subscribeSpark('weather', handler);

    // Should have sent subscribeSpark message
    const subMsg = sent.find((m) => m.t === subscribeSpark.name) as Record<string, unknown>;
    expect(subMsg).toBeDefined();
    const subscriptionId = subMsg.subscriptionId as string;

    // Simulate an incoming spark event
    await triggerMessage(channel, sparkEvent.name, {
      subscriptionId,
      event: { type: 'weather', payload: { temp: 25 }, source: 'test', ts: 1, id: 'e1' },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'weather', payload: { temp: 25 } })
    );

    // Unsubscribe
    unsub();
    const unsubMsg = sent.find((m) => m.t === unsubscribeSpark.name);
    expect(unsubMsg).toBeDefined();
  });
});

// ─── Bricks ───────────────────────────────────────────────────────────────────

describe('Prelude Bricks', () => {
  const declaredBricks = new Set(['clock', 'weather']);
  let channel: Channel;
  let sent: WireMessage[];

  beforeEach(() => {
    logMock.mockClear();
    ({ channel, sent } = createTestChannel());
  });

  test('registerBrickType validates against manifest', () => {
    const bricks = setupBricks(channel, logMock, declaredBricks);

    expect(() => bricks.registerBrickType({ id: 'unknown', families: ['sm'] })).toThrow(
      'not in package.json'
    );
  });

  test('registerBrickType sends message for declared brick', () => {
    const bricks = setupBricks(channel, logMock, declaredBricks);
    bricks.registerBrickType({ id: 'clock', families: ['sm', 'md'] });

    const msg = sent.find((m) => m.t === registerBrickType.name) as Record<string, unknown>;
    expect(msg).toBeDefined();
    expect((msg.brickType as Record<string, unknown>).id).toBe('clock');
  });

  test('setBrickData sends message for declared brick', () => {
    const bricks = setupBricks(channel, logMock, declaredBricks);
    bricks.setBrickData('clock', { time: '12:00' });

    const msg = sent.find((m) => m.t === pushBrickData.name) as Record<string, unknown>;
    expect(msg).toBeDefined();
    expect(msg.brickTypeId).toBe('clock');
  });

  test('setBrickData logs error for unknown brick', () => {
    const bricks = setupBricks(channel, logMock, declaredBricks);
    bricks.setBrickData('unknown', {});

    expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('unknown brick type'));
  });

  test('onBrickConfigChange dispatches and can unsubscribe', async () => {
    const bricks = setupBricks(channel, logMock, declaredBricks);
    const handler = mock();

    const unsub = bricks.onBrickConfigChange(handler);

    await triggerMessage(channel, updateBrickConfig.name, {
      instanceId: 'inst-1',
      config: { color: 'red' },
    });

    expect(handler).toHaveBeenCalledWith('inst-1', { color: 'red' });

    unsub();
    handler.mockClear();

    await triggerMessage(channel, updateBrickConfig.name, {
      instanceId: 'inst-2',
      config: {},
    });

    expect(handler).not.toHaveBeenCalled();
  });

  test('onBrickConfigChange logs error from handler', async () => {
    const bricks = setupBricks(channel, logMock, declaredBricks);
    bricks.onBrickConfigChange(() => {
      throw new Error('handler boom');
    });

    await triggerMessage(channel, updateBrickConfig.name, {
      instanceId: 'inst-1',
      config: {},
    });

    expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('handler boom'));
  });
});

// ─── Blocks ───────────────────────────────────────────────────────────────────

describe('Prelude Blocks', () => {
  const blockMeta = new Map([
    ['timer', { id: 'timer', name: 'Timer', category: 'util', description: 'A timer block' }],
  ]);
  let channel: Channel;
  let sent: WireMessage[];

  beforeEach(() => {
    logMock.mockClear();
    ({ channel, sent } = createTestChannel());
  });

  function makeBlock(overrides: Partial<RegisterBlockSpec> = {}): RegisterBlockSpec {
    return {
      id: 'timer',
      inputs: [{ id: 'in', typeName: 'number' }],
      outputs: [{ id: 'out', typeName: 'string' }],
      schema: {},
      ...overrides,
    };
  }

  test('registerBlock validates against manifest', () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);

    expect(() => blocks.registerBlock(makeBlock({ id: 'unknown' }))).toThrow('not in package.json');
  });

  test('registerBlock rejects duplicate registration', () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    blocks.registerBlock(makeBlock());

    expect(() => blocks.registerBlock(makeBlock())).toThrow('already registered');
  });

  test('registerBlock sends registration message with metadata', () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    blocks.registerBlock(makeBlock());

    const msg = sent.find((m) => m.t === registerBlock.name) as Record<string, unknown>;
    expect(msg).toBeDefined();
    const block = msg.block as Record<string, unknown>;
    expect(block.id).toBe('timer');
    expect(block.name).toBe('Timer');
    expect(block.category).toBe('util');
  });

  test('startBlock RPC starts a reactive block', async () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    const stopFn = mock();
    const pushFn = mock();

    blocks.registerBlock(
      makeBlock({
        start: (ctx) => {
          ctx.emit('out', 'started');
          return { pushInput: pushFn, stop: stopFn };
        },
      })
    );

    const result = await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'plugin:timer',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    expect(result).toMatchObject({ ok: true });

    // Should have emitted via blockEmit
    const emitMsg = sent.find((m) => m.t === blockEmit.name) as Record<string, unknown>;
    expect(emitMsg).toBeDefined();
    expect(emitMsg.port).toBe('out');
  });

  test('startBlock returns error for unknown block', async () => {
    setupBlocks(channel, logMock, blockMeta);

    const result = await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'unknown',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('not found') });
  });

  test('startBlock returns error for duplicate instance', async () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    blocks.registerBlock(
      makeBlock({
        start: () => ({ pushInput: mock(), stop: mock() }),
      })
    );

    await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'timer',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    const result = await triggerRpc(
      channel,
      sent,
      startBlock.name,
      {
        blockType: 'timer',
        instanceId: 'inst-1',
        workflowId: 'wf-2',
        config: {},
      },
      2
    );

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('already exists') });
  });

  test('startBlock catches errors from start function', async () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    blocks.registerBlock(
      makeBlock({
        start: () => {
          throw new Error('start failed');
        },
      })
    );

    const result = await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'timer',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('start failed') });
  });

  test('pushInput forwards data to block instance', async () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    const pushFn = mock();

    blocks.registerBlock(
      makeBlock({
        start: () => ({ pushInput: pushFn, stop: mock() }),
      })
    );

    await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'timer',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    await triggerMessage(channel, pushInput.name, {
      instanceId: 'inst-1',
      port: 'in',
      data: 42,
    });

    expect(pushFn).toHaveBeenCalledWith('in', 42);
  });

  test('stopBlock stops and removes instance', async () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    const stopFn = mock();

    blocks.registerBlock(
      makeBlock({
        start: () => ({ pushInput: mock(), stop: stopFn }),
      })
    );

    await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'timer',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    await triggerMessage(channel, stopBlock.name, { instanceId: 'inst-1' });

    expect(stopFn).toHaveBeenCalled();
  });

  test('stopAllInstances cleans up all running instances', async () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    const stopFn = mock();

    blocks.registerBlock(
      makeBlock({
        start: () => ({ pushInput: mock(), stop: stopFn }),
      })
    );

    await triggerRpc(channel, sent, startBlock.name, {
      blockType: 'timer',
      instanceId: 'inst-1',
      workflowId: 'wf-1',
      config: {},
    });

    blocks.stopAllInstances();
    expect(stopFn).toHaveBeenCalled();
  });

  test('registerBlock without start function works (static block)', () => {
    const blocks = setupBlocks(channel, logMock, blockMeta);
    const result = blocks.registerBlock(makeBlock({ start: undefined }));

    expect(result).toEqual({ id: 'timer' });
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('Prelude Lifecycle', () => {
  let channel: Channel;
  let sent: WireMessage[];

  beforeEach(() => {
    logMock.mockClear();
    ({ channel, sent } = createTestChannel());
  });

  test('onInit runs handler after first preferences message', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const initFn = mock();
    lifecycle.onInit(initFn);

    // First preferences message triggers init
    await triggerMessage(channel, preferences.name, { values: { theme: 'dark' } });

    expect(initFn).toHaveBeenCalled();
  });

  test('onInit runs immediately if already initialized', async () => {
    const lifecycle = setupLifecycle(channel, logMock);

    // Initialize
    await triggerMessage(channel, preferences.name, { values: {} });

    // Register after init -- should run immediately
    const lateFn = mock();
    lifecycle.onInit(lateFn);

    // Wait a tick for the Promise.resolve().then() to flush
    await new Promise((r) => setTimeout(r, 10));

    expect(lateFn).toHaveBeenCalled();
  });

  test('init handlers only run once', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const initFn = mock();
    lifecycle.onInit(initFn);

    await triggerMessage(channel, preferences.name, { values: { a: 1 } });
    await triggerMessage(channel, preferences.name, { values: { a: 2 } });

    expect(initFn).toHaveBeenCalledTimes(1);
  });

  test('init handler error is logged', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    lifecycle.onInit(() => {
      throw new Error('init boom');
    });

    await triggerMessage(channel, preferences.name, { values: {} });

    expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('init boom'));
  });

  test('onPreferencesChange fires on subsequent preferences messages', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const changeFn = mock();
    lifecycle.onPreferencesChange(changeFn);

    // First message triggers init, not change
    await triggerMessage(channel, preferences.name, { values: { a: 1 } });
    expect(changeFn).not.toHaveBeenCalled();

    // Second message triggers change
    await triggerMessage(channel, preferences.name, { values: { a: 2 } });
    expect(changeFn).toHaveBeenCalledWith({ a: 2 });
  });

  test('onPreferencesChange unsubscribe works', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const changeFn = mock();
    const unsub = lifecycle.onPreferencesChange(changeFn);

    await triggerMessage(channel, preferences.name, { values: { a: 1 } });
    unsub();

    await triggerMessage(channel, preferences.name, { values: { a: 2 } });
    expect(changeFn).not.toHaveBeenCalled();
  });

  test('getPreferences returns current preferences', async () => {
    const lifecycle = setupLifecycle(channel, logMock);

    expect(lifecycle.getPreferences()).toEqual({});

    await triggerMessage(channel, preferences.name, { values: { lang: 'en' } });
    expect(lifecycle.getPreferences()).toEqual({ lang: 'en' });
  });

  test('updatePreference updates local state and sends message', async () => {
    const lifecycle = setupLifecycle(channel, logMock);

    await triggerMessage(channel, preferences.name, { values: { lang: 'en' } });
    lifecycle.updatePreference('lang', 'fr');

    expect(lifecycle.getPreferences().lang).toBe('fr');
    const msg = sent.find((m) => m.t === updatePreference.name) as Record<string, unknown>;
    expect(msg).toBeDefined();
    expect(msg.key).toBe('lang');
    expect(msg.value).toBe('fr');
  });

  test('onUninstall runs handlers', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const uninstallFn = mock();
    lifecycle.onUninstall(uninstallFn);

    await triggerMessage(channel, uninstall.name, {});

    expect(uninstallFn).toHaveBeenCalled();
  });

  test('onUninstall logs handler errors', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    lifecycle.onUninstall(() => {
      throw new Error('uninstall boom');
    });

    await triggerMessage(channel, uninstall.name, {});

    expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('uninstall boom'));
  });

  test('onUninstall unsubscribe works', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const fn = mock();
    const unsub = lifecycle.onUninstall(fn);
    unsub();

    await triggerMessage(channel, uninstall.name, {});
    expect(fn).not.toHaveBeenCalled();
  });

  test('definePreferenceOptions and preferenceOptions RPC', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    lifecycle.definePreferenceOptions('theme', () => [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light' },
    ]);

    const result = await triggerRpc(channel, sent, preferenceOptions.name, { name: 'theme' });
    expect(result).toEqual({
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ],
    });
  });

  test('preferenceOptions RPC returns empty for unknown provider', async () => {
    setupLifecycle(channel, logMock);

    const result = await triggerRpc(channel, sent, preferenceOptions.name, { name: 'nope' });
    expect(result).toEqual({ options: [] });
  });

  test('preferenceOptions RPC logs provider errors', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    lifecycle.definePreferenceOptions('broken', () => {
      throw new Error('provider boom');
    });

    const result = await triggerRpc(channel, sent, preferenceOptions.name, { name: 'broken' });
    expect(result).toEqual({ options: [] });
    expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('provider boom'));
  });

  test('onInit unsubscribe before init prevents execution', async () => {
    const lifecycle = setupLifecycle(channel, logMock);
    const fn = mock();
    const unsub = lifecycle.onInit(fn);
    unsub();

    await triggerMessage(channel, preferences.name, { values: {} });
    expect(fn).not.toHaveBeenCalled();
  });
});
