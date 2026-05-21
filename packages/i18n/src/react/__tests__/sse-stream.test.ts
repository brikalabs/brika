import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { type RegistryChange, RegistryEventStream } from '../sse-stream';

type Listener = (event: MessageEvent | Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static shouldThrow = false;

  readonly url: string;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  onopen: Listener | null = null;
  closed = false;
  closeShouldThrow = false;

  constructor(url: string) {
    if (FakeEventSource.shouldThrow) {
      throw new Error('EventSource not supported');
    }
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emitMessage(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  emitError(): void {
    this.onerror?.(new Event('error'));
  }

  emitOpen(): void {
    this.onopen?.(new Event('open'));
  }

  close(): void {
    if (this.closeShouldThrow) {
      throw new Error('already closed');
    }
    this.closed = true;
  }
}

interface OriginalGlobals {
  EventSource: unknown;
  hasEventSource: boolean;
  window: unknown;
  hasWindow: boolean;
}

let originals: OriginalGlobals;

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  originals = {
    EventSource: g.EventSource,
    hasEventSource: 'EventSource' in g,
    window: g.window,
    hasWindow: 'window' in g,
  };
  g.EventSource = FakeEventSource;
  g.window = g.window ?? {};
  FakeEventSource.instances = [];
  FakeEventSource.shouldThrow = false;
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  if (originals.hasEventSource) {
    g.EventSource = originals.EventSource;
  } else {
    delete g.EventSource;
  }
  if (originals.hasWindow) {
    g.window = originals.window;
  } else {
    delete g.window;
  }
});

describe('RegistryEventStream', () => {
  test('start() opens an EventSource against `${apiPrefix}/events`', () => {
    const stream = new RegistryEventStream({
      apiPrefix: '/api/i18n',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    stream.start();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe('/api/i18n/events');
  });

  test('start() is idempotent — does not open a second EventSource', () => {
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    stream.start();
    stream.start();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  test('parses valid frames and forwards them to onChange', () => {
    const onChange = mock<(c: RegistryChange) => void>(() => undefined);
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange,
      onReconnect: () => undefined,
    });
    stream.start();
    const source = FakeEventSource.instances[0];
    source?.emitMessage(JSON.stringify({ kind: 'set', namespace: 'common', locale: 'fr' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual({
      kind: 'set',
      namespace: 'common',
      locale: 'fr',
    });
  });

  test('drops frames with invalid JSON', () => {
    const onChange = mock<(c: RegistryChange) => void>(() => undefined);
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange,
      onReconnect: () => undefined,
    });
    stream.start();
    FakeEventSource.instances[0]?.emitMessage('not json{');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('drops frames that fail schema validation', () => {
    const onChange = mock<(c: RegistryChange) => void>(() => undefined);
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange,
      onReconnect: () => undefined,
    });
    stream.start();
    FakeEventSource.instances[0]?.emitMessage(JSON.stringify({ kind: 'unknown' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('accepts a `clear` kind with a null namespace', () => {
    const onChange = mock<(c: RegistryChange) => void>(() => undefined);
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange,
      onReconnect: () => undefined,
    });
    stream.start();
    FakeEventSource.instances[0]?.emitMessage(JSON.stringify({ kind: 'clear', namespace: null }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.kind).toBe('clear');
  });

  test('open without prior error does not invoke onReconnect', () => {
    const onReconnect = mock<() => void>(() => undefined);
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect,
    });
    stream.start();
    FakeEventSource.instances[0]?.emitOpen();
    expect(onReconnect).not.toHaveBeenCalled();
  });

  test('error followed by open triggers onReconnect exactly once', () => {
    const onReconnect = mock<() => void>(() => undefined);
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect,
    });
    stream.start();
    const source = FakeEventSource.instances[0];
    source?.emitError();
    source?.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    // Subsequent opens without a new error must not re-fire reconnect.
    source?.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test('start() silently no-ops when EventSource constructor throws', () => {
    FakeEventSource.shouldThrow = true;
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    expect(() => stream.start()).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  test('start() is a no-op in non-browser environments (no window)', () => {
    const g = globalThis as Record<string, unknown>;
    delete g.window;
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    stream.start();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  test('close() shuts the EventSource and allows a fresh start() afterwards', () => {
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    stream.start();
    const first = FakeEventSource.instances[0];
    stream.close();
    expect(first?.closed).toBe(true);
    stream.start();
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  test('close() is a no-op when no EventSource is active', () => {
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    expect(() => stream.close()).not.toThrow();
  });

  test('close() swallows EventSource.close() exceptions', () => {
    const stream = new RegistryEventStream({
      apiPrefix: '/api',
      onChange: () => undefined,
      onReconnect: () => undefined,
    });
    stream.start();
    const source = FakeEventSource.instances[0];
    if (source) {
      source.closeShouldThrow = true;
    }
    expect(() => stream.close()).not.toThrow();
  });
});
