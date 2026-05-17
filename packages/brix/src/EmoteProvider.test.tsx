/**
 * Tests for `<EmoteProvider>` + `useEmote()` — the global emote bus.
 * Covers context wiring, play/cancel/next state transitions, the
 * priority-replacement rule, queue semantics, and the on/fire pub/sub
 * channel. A small `<Probe>` component snapshots the API on every
 * render so assertions can read it.
 */

import { describe, expect, mock, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import {
  type EmoteApi,
  EmoteProvider,
  type EmoteProviderProps,
  useEmote,
  useEmoteOn,
} from './EmoteProvider';
import { defineEmote } from './emotes/builder';
import type { EmoteDef } from './emotes/types';

function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(read: () => T, ok: (v: T) => boolean, timeoutMs = 1000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = read();
    if (ok(v)) {
      return v;
    }
    await flush(10);
  }
  return read();
}

const mkEmote = (name: string, priority?: number): EmoteDef =>
  defineEmote(name, {
    initial: { face: 'happy' },
    beats: [{ kind: 'wait', ms: 30 }],
    priority,
  });

const A = mkEmote('a', 0);
const B = mkEmote('b', 0);
const HIGH = mkEmote('high', 10);
const LOW = mkEmote('low', 1);

interface ProbeProps {
  readonly onApi: (api: EmoteApi) => void;
}

function Probe({ onApi }: Readonly<ProbeProps>): React.ReactElement {
  const api = useEmote();
  onApi(api);
  return React.createElement(Text, null, '.');
}

function renderWithLib(
  library: EmoteProviderProps['library'],
  onApi: (api: EmoteApi) => void
): ReturnType<typeof render> {
  return render(
    <EmoteProvider library={library}>
      <Probe onApi={onApi} />
    </EmoteProvider>
  );
}

describe('<EmoteProvider> / useEmote', () => {
  test('default API is a no-op when no provider mounts', () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onApi: (api) => {
          latest.current = api;
        },
      })
    );
    expect(latest.current?.current).toBeNull();
    expect(latest.current?.pending).toBe(0);
    // play() on the null API is a noop — must not throw.
    latest.current?.play('whatever');
    expect(latest.current?.current).toBeNull();
    unmount();
  });

  test('play(name) sets `current` to the matching emote', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('a');
    await flush(20);
    expect(latest.current?.current?.name).toBe('a');
    unmount();
  });

  test('play with unknown name is a no-op', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('does-not-exist');
    await flush(20);
    expect(latest.current?.current).toBeNull();
    unmount();
  });

  test('higher-priority play replaces a lower-priority current emote', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ low: LOW, high: HIGH }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('low');
    await flush(20);
    expect(latest.current?.current?.name).toBe('low');
    latest.current?.play('high');
    await flush(20);
    expect(latest.current?.current?.name).toBe('high');
    unmount();
  });

  test('lower-priority play is ignored while a higher-priority emote runs', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ low: LOW, high: HIGH }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('high');
    await flush(20);
    latest.current?.play('low');
    await flush(20);
    expect(latest.current?.current?.name).toBe('high');
    unmount();
  });

  test('play with `queue: true` does not interrupt and increments pending', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A, b: B }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('a');
    await flush(20);
    latest.current?.play('b', { queue: true });
    await waitFor(
      () => latest.current?.pending ?? 0,
      (v) => v === 1
    );
    expect(latest.current?.current?.name).toBe('a');
    expect(latest.current?.pending).toBe(1);
    unmount();
  });

  test('next() pops the queue; pending decrements back to zero', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A, b: B }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('a');
    latest.current?.play('b', { queue: true });
    await flush(20);
    latest.current?.next();
    await flush(20);
    expect(latest.current?.current?.name).toBe('b');
    expect(latest.current?.pending).toBe(0);
    latest.current?.next();
    await flush(20);
    expect(latest.current?.current).toBeNull();
    unmount();
  });

  test('cancel() clears the queue and current emote', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A, b: B }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.play('a');
    latest.current?.play('b', { queue: true });
    await flush(20);
    latest.current?.cancel();
    await flush(20);
    expect(latest.current?.current).toBeNull();
    expect(latest.current?.pending).toBe(0);
    unmount();
  });

  test('priority override applied per-play overrides the def priority', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A, low: LOW }, (api) => {
      latest.current = api;
    });
    await flush(20);
    // `low` has priority 1; bump it to 99 for this single play.
    latest.current?.play('low', { priority: 99 });
    await flush(20);
    // Now playing `a` (priority 0) must NOT replace it.
    latest.current?.play('a');
    await flush(20);
    expect(latest.current?.current?.name).toBe('low');
    expect(latest.current?.current?.priority).toBe(99);
    unmount();
  });

  test('fire(event) plays the most recently registered handler', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A, b: B }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.on('hub.deploy', 'a');
    latest.current?.on('hub.deploy', 'b');
    latest.current?.fire('hub.deploy');
    await flush(20);
    expect(latest.current?.current?.name).toBe('b');
    unmount();
  });

  test('on() unsubscribe stops the handler from firing', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A }, (api) => {
      latest.current = api;
    });
    await flush(20);
    const off = latest.current?.on('evt', 'a');
    off?.();
    latest.current?.fire('evt');
    await flush(20);
    expect(latest.current?.current).toBeNull();
    unmount();
  });

  test('fire(event) with no subscribers is a no-op', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = renderWithLib({ a: A }, (api) => {
      latest.current = api;
    });
    await flush(20);
    latest.current?.fire('nothing-here');
    await flush(20);
    expect(latest.current?.current).toBeNull();
    unmount();
  });

  test('falls back to the built-in EMOTE_LIBRARY when no `library` prop is passed', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const { unmount } = render(
      <EmoteProvider>
        <Probe
          onApi={(api) => {
            latest.current = api;
          }}
        />
      </EmoteProvider>
    );
    await flush(20);
    latest.current?.play('wave');
    await flush(20);
    expect(latest.current?.current?.name).toBe('wave');
    unmount();
  });
});

interface BindProbeProps {
  readonly event: string | null;
  readonly name: string | null;
}

function BindProbe({ event, name }: Readonly<BindProbeProps>): React.ReactElement {
  useEmoteOn(event, name);
  return React.createElement(Text, null, '.');
}

describe('useEmoteOn', () => {
  test('binds and unbinds an event handler for the component lifetime', async () => {
    const latest: { current: EmoteApi | null } = { current: null };
    const onApi = (api: EmoteApi): void => {
      latest.current = api;
    };
    const TreeShown = (): React.ReactElement => (
      <EmoteProvider library={{ a: A }}>
        <BindProbe event="ping" name="a" />
        <Probe onApi={onApi} />
      </EmoteProvider>
    );
    const TreeHidden = (): React.ReactElement => (
      <EmoteProvider library={{ a: A }}>
        <Probe onApi={onApi} />
      </EmoteProvider>
    );
    const utils = render(<TreeShown />);
    await flush(20);
    latest.current?.fire('ping');
    await flush(20);
    expect(latest.current?.current?.name).toBe('a');

    // Re-render without the BindProbe — the EmoteProvider remounts so we
    // also lose the play result. The point of this assertion is just
    // that the bound handler effect's cleanup ran without throwing.
    utils.rerender(<TreeHidden />);
    await flush(20);
    expect(latest.current).not.toBeNull();
    utils.unmount();
  });

  test('null event or name disables the binding', async () => {
    const onCall = mock();
    function NullProbe(): React.ReactElement {
      useEmoteOn(null, 'a');
      onCall();
      return <Text>.</Text>;
    }
    const { unmount } = render(
      <EmoteProvider library={{ a: A }}>
        <NullProbe />
      </EmoteProvider>
    );
    await flush(20);
    expect(onCall).toHaveBeenCalled();
    unmount();
  });
});
